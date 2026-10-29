/**
 * Unit tests for DaoService.
 *
 * Scope: the service layer only. Repositories are replaced with in-memory
 * fakes (tests/fakes/*.fake.ts), so these tests need no database, no broker
 * and no network. Run with `bun test` from services/dao.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import mongoose, { Types } from 'mongoose';
import { AppError } from '@shared/errors/app-errors';
import { DaoService } from '../src/services/dao.service';
import type { ProposalRepository } from '../src/repositories/proposal.repository';
import type { StakingRepository } from '../src/repositories/staking.repository';
import type { StakingHistoryRepository } from '../src/repositories/stakingHistory.repository';
import type { TimelockTaskRepository } from '../src/repositories/timelockTask.repository';
import type { TreasuryWithdrawRepository } from '../src/repositories/treasuryWithdraw.repository';
import type { VoteRepository } from '../src/repositories/vote.repository';
import {
  createFakeProposalRepository,
  type FakeProposalDoc,
  type FakeProposalRepository,
} from './fakes/proposal.repository.fake';
import { createFakeVoteRepository, type FakeVoteRepository } from './fakes/vote.repository.fake';
import { createFakeStakingRepository, type FakeStakingRepository } from './fakes/staking.repository.fake';
import {
  createFakeStakingHistoryRepository,
  type FakeStakingHistoryRepository,
} from './fakes/stakingHistory.repository.fake';
import {
  createFakeTimelockTaskRepository,
  type FakeTimelockTaskRepository,
} from './fakes/timelockTask.repository.fake';
import {
  createFakeTreasuryWithdrawRepository,
  type FakeTreasuryWithdrawRepository,
} from './fakes/treasuryWithdraw.repository.fake';

// Blockchain events as the daemon forwards them: decoded contract fields live
// in `data`, the envelope (chainId, transactionHash, logIndex, blockNumber)
// sits on the root.

const PROPOSAL = {
  proposalId: '7',
  proposer: '0xAlice',
  target: '0xTreasury',
  data: '0xdeadbeef',
  description: 'Raise the staking cap',
  creationTime: 1_700_000_000,
  endTime: 1_700_086_400,
  chainId: '1',
  transactionHash: '0xtx1',
  logIndex: 4,
};

const PROPOSAL_CREATED_EVENT = {
  name: 'Governance_ProposalCreated',
  address: '0xGovernance',
  timestamp: 1_700_000_000,
  data: {
    emittedFrom: '0xGovernance',
    proposalId: '7',
    proposer: '0xAlice',
    target: '0xTreasury',
    data: '0xdeadbeef',
    description: 'Raise the staking cap',
    creationTime: '1700000000',
    endTime: '1700086400',
  },
  chainId: '1',
  transactionHash: '0xtx1',
  logIndex: 4,
  blockNumber: 123_456,
};

const STAKING_EVENT = {
  name: 'DaoStaking_TokensStaked',
  address: '0xStaking',
  data: {
    emittedFrom: '0xStaking',
    staker: '0xBob',
    amount: '250',
    rewardsReceived: '0',
    newVotingPower: '250',
  },
  chainId: '1',
  transactionHash: '0xtx4',
  logIndex: 1,
  blockNumber: 123_456,
  timestamp: 1_700_000_000,
};

const TIMELOCK_EVENT = {
  name: 'Timelock_TransactionQueued',
  address: '0xTimelock',
  timestamp: 1_700_000_000,
  data: {
    emittedFrom: '0xTimelock',
    txHash: '0xtimelock1',
    target: '0xTreasury',
    data: '0xdeadbeef',
    eta: '1700090000',
  },
  chainId: '1',
  transactionHash: '0xtx6',
  logIndex: 3,
  blockNumber: 123_456,
};

/**
 * Wraps a decoded event literal into the full BlockchainEvent envelope:
 * name / address / timestamp are not used by DaoService, but the events the
 * scanner publishes always carry them.
 */
function asEvent<TData extends Record<string, any>>(event: {
  data: TData;
  chainId: string;
  transactionHash: string;
  logIndex: number;
  blockNumber: number;
  timestamp?: number;
  name?: string;
  address?: string;
}) {
  return {
    name: 'Unknown',
    address: '0x0000000000000000000000000000000000000000',
    timestamp: 1_700_000_000,
    ...event,
  };
}

describe('DaoService (unit, fake repositories)', () => {
  let proposals: FakeProposalRepository;
  let votes: FakeVoteRepository;
  let staking: FakeStakingRepository;
  let stakingHistory: FakeStakingHistoryRepository;
  let timelockTasks: FakeTimelockTaskRepository;
  let treasuryWithdrawals: FakeTreasuryWithdrawRepository;
  // The proxy appends the commit closure, so the call sites keep one argument.
  let service: any;
  let commitInbox: ReturnType<typeof mock<() => Promise<void>>>;

  beforeEach(() => {
    proposals = createFakeProposalRepository();
    votes = createFakeVoteRepository();
    staking = createFakeStakingRepository();
    stakingHistory = createFakeStakingHistoryRepository();
    timelockTasks = createFakeTimelockTaskRepository();
    treasuryWithdrawals = createFakeTreasuryWithdrawRepository();
    commitInbox = mock(async (): Promise<void> => undefined);

    // The service writes its rows and the inbox marker in one transaction.
    (mongoose.connection as unknown as { transaction: unknown }).transaction = async <T>(
      fn: () => Promise<T>,
    ): Promise<T> => fn();

    const raw = new DaoService(
      proposals as unknown as ProposalRepository,
      staking as unknown as StakingRepository,
      stakingHistory as unknown as StakingHistoryRepository,
      timelockTasks as unknown as TimelockTaskRepository,
      treasuryWithdrawals as unknown as TreasuryWithdrawRepository,
      votes as unknown as VoteRepository,
    );

    // Every handler now takes the commit closure: the proxy appends it, so the
    // call sites below stay focused on their own arguments.
    service = new Proxy(raw, {
      get: (target, property, receiver) => {
        const value = Reflect.get(target, property, receiver);
        if (typeof value !== 'function') return value;

        return (...args: unknown[]) => value.apply(target, [...args, commitInbox]);
      },
    }) as DaoService;
  });

  test('processProposalCreated: forwards the payload and stores a pending proposal', async () => {
    await expect(service.processProposalCreated(PROPOSAL_CREATED_EVENT)).resolves.toBeUndefined();

    expect(proposals.create).toHaveBeenCalledTimes(1);
    expect(proposals.create).toHaveBeenCalledWith({
      proposalId: '7',
      proposer: '0xAlice',
      target: '0xTreasury',
      data: '0xdeadbeef',
      description: 'Raise the staking cap',
      creationTime: 1_700_000_000,
      endTime: 1_700_086_400,
      chainId: '1',
      transactionHash: '0xtx1',
      logIndex: 4,
    });

    // emittedFrom is event metadata: it is not stored on the proposal document.
    const stored = Array.from(proposals.store.values());
    expect(stored).toHaveLength(1);
    expect(stored[0].state).toBe('pending'); // schema default, same as ProposalEntity
    expect(stored[0].creationTime).toBe(1_700_000_000); // bigint string from the scanner, stored as a number
  });

  test('processProposalExecuted: marks the proposal executed', async () => {
    await service.processProposalCreated(PROPOSAL_CREATED_EVENT);

    await expect(
      service.processProposalExecuted(
        asEvent({
          data: {
            emittedFrom: '0xGovernance',
            proposalId: '7',
            executor: '0xAlice',
          },
          chainId: '1',
          transactionHash: '0xtx2',
          logIndex: 1,
          blockNumber: 123_456,
        }),
      ),
    ).resolves.toBeUndefined();

    expect(proposals.updateState).toHaveBeenCalledTimes(1);
    expect(proposals.updateState).toHaveBeenCalledWith('7', 'executed', { executor: '0xAlice' });
    expect(Array.from(proposals.store.values())[0].state).toBe('executed');
    expect(Array.from(proposals.store.values())[0].executor).toBe('0xAlice');
  });

  test('processProposalExecuted: an unknown proposal is ignored (current behavior)', async () => {
    // findOneAndUpdate without upsert resolves to null for an unknown proposalId;
    // the service ignores the return value, so nothing is thrown and nothing is written.
    await expect(
      service.processProposalExecuted(
        asEvent({
          data: {
            emittedFrom: '0xGovernance',
            proposalId: 'unknown',
            executor: '0xAlice',
          },
          chainId: '1',
          transactionHash: '0xtx2',
          logIndex: 1,
          blockNumber: 123_456,
        }),
      ),
    ).resolves.toBeUndefined();

    expect(proposals.updateState).toHaveBeenCalledWith('unknown', 'executed', { executor: '0xAlice' });
    expect(proposals.store.size).toBe(0);
  });

  test('processProposalCancelled: marks the proposal canceled', async () => {
    await service.processProposalCreated(PROPOSAL_CREATED_EVENT);

    await service.processProposalCancelled(
      asEvent({
        data: {
          emittedFrom: '0xGovernance',
          proposalId: '7',
          canceller: '0xAlice',
        },
        chainId: '1',
        transactionHash: '0xtx3',
        logIndex: 2,
        blockNumber: 123_456,
      }),
    );

    // 'canceled' (single l) is the value pinned in ProposalStateList.
    expect(proposals.updateState).toHaveBeenCalledWith('7', 'canceled', { canceller: '0xAlice' });
    expect(Array.from(proposals.store.values())[0].state).toBe('canceled');
    expect(Array.from(proposals.store.values())[0].canceller).toBe('0xAlice');
  });

  test('processVoteCast: stores the vote with governanceAddress mapped from emittedFrom', async () => {
    await expect(
      service.processVoteCast(
        asEvent({
          data: {
            emittedFrom: '0xGovernance',
            proposalId: '7',
            voter: '0xCarol',
            support: true,
            weight: '123.45',
            reason: 'Good proposal',
          },
          chainId: '1',
          transactionHash: '0xtx3',
          logIndex: 0,
          blockNumber: 42,
        }),
      ),
    ).resolves.toBeUndefined();

    expect(votes.create).toHaveBeenCalledTimes(1);
    expect(votes.create).toHaveBeenCalledWith({
      proposalId: '7',
      chainId: '1',
      governanceAddress: '0xGovernance',
      voterWallet: '0xCarol',
      support: true,
      weight: '123.45',
      reason: 'Good proposal',
      transactionHash: '0xtx3',
      logIndex: 0,
      blockNumber: 42,
    });

    const [storedVote] = Array.from(votes.store.values());
    expect(storedVote.support).toBe(true);
    expect(storedVote.weight).toBe('123.45');
  });

  test('processTokensStaked: mirrors the absolute amount from the event and records the staking history', async () => {
    await service.processTokensStaked(STAKING_EVENT);

    expect(staking.setAmount).toHaveBeenCalledTimes(1);
    // The event carries the full post-state and the block time; both are stored as-is.
    expect(staking.setAmount).toHaveBeenCalledWith('0xBob', '1', '250', 1_700_000_000);

    expect(stakingHistory.create).toHaveBeenCalledTimes(1);
    expect(stakingHistory.create).toHaveBeenCalledWith({
      staker: '0xBob',
      amount: '250',
      rewards: '0',
      operation: 'staked',
      chainId: '1',
      transactionHash: '0xtx4',
      logIndex: 1,
      blockNumber: 123_456,
    });

    const stake = staking.store.get('0xBob|1');
    expect(stake?.amount).toBe('250');
    expect(stake?.lastStakeTimestamp).toBe(1_700_000_000);
  });

  test('processTokensStaked: each event replaces the stored amount with the full post-state', async () => {
    await service.processTokensStaked(
      asEvent({
        ...STAKING_EVENT,
        data: { ...STAKING_EVENT.data, amount: '100', newVotingPower: '100' },
      }),
    );
    await service.processTokensStaked(
      asEvent({
        ...STAKING_EVENT,
        data: { ...STAKING_EVENT.data, amount: '50.5', newVotingPower: '150.5' },
        transactionHash: '0xtx5',
      }),
    );
    await service.processTokensStaked(
      asEvent({
        ...STAKING_EVENT,
        data: { ...STAKING_EVENT.data, amount: '7', newVotingPower: '7' },
        chainId: '137',
      }),
    );

    expect(staking.setAmount).toHaveBeenCalledTimes(3);
    expect(staking.store.get('0xBob|1')?.amount).toBe('150.5');
    expect(staking.store.get('0xBob|137')?.amount).toBe('7');
  });

  test('processTokensUnstaked: mirrors the absolute amount and keeps rewards in the history', async () => {
    await service.processTokensStaked(
      asEvent({
        ...STAKING_EVENT,
        data: { ...STAKING_EVENT.data, amount: '100', newVotingPower: '100' },
      }),
    );

    await service.processTokensUnstaked(
      asEvent({
        ...STAKING_EVENT,
        data: { ...STAKING_EVENT.data, amount: '40', rewardsReceived: '1.5', newVotingPower: '60' },
        transactionHash: '0xtx5',
        logIndex: 2,
        timestamp: 1_700_000_500,
      }),
    );

    // Partial unstake: the event value is the full post-state, and the contract
    // resets its stakingTimestamp -> lastStakeTimestamp moves with the block time.
    expect(staking.setAmount).toHaveBeenLastCalledWith('0xBob', '1', '60', 1_700_000_500);
    expect(stakingHistory.create).toHaveBeenLastCalledWith({
      staker: '0xBob',
      amount: '40',
      rewards: '1.5',
      operation: 'unstaked',
      chainId: '1',
      transactionHash: '0xtx5',
      logIndex: 2,
      blockNumber: 123_456,
    });
    expect(staking.store.get('0xBob|1')?.amount).toBe('60');
    expect(staking.store.get('0xBob|1')?.lastStakeTimestamp).toBe(1_700_000_500);

    // Full exit: voting power zeroes out and lastStakeTimestamp is left untouched.
    await service.processTokensUnstaked(
      asEvent({
        ...STAKING_EVENT,
        data: { ...STAKING_EVENT.data, amount: '61.5', rewardsReceived: '1.5', newVotingPower: '0' },
        transactionHash: '0xtx6',
        logIndex: 3,
        timestamp: 1_700_000_900,
      }),
    );
    expect(staking.store.get('0xBob|1')?.amount).toBe('0');
    expect(staking.store.get('0xBob|1')?.lastStakeTimestamp).toBe(1_700_000_500);
  });

  test('processTokensLocked: stores the voting lock timestamp on the staking record', async () => {
    await service.processTokensStaked(STAKING_EVENT);

    await service.processTokensLocked(
      asEvent({
        data: { emittedFrom: '0xStaking', user: '0xBob', unlockTimestamp: '1700086400' },
        chainId: '1',
        transactionHash: '0xtx11',
        logIndex: 4,
        blockNumber: 123_457,
        timestamp: 1_700_000_100,
      }),
    );

    expect(staking.setUnlockTimestamp).toHaveBeenCalledTimes(1);
    expect(staking.setUnlockTimestamp).toHaveBeenCalledWith('0xBob', '1', 1_700_086_400);
    expect(staking.store.get('0xBob|1')?.unlockTimestamp).toBe(1_700_086_400);
  });

  test('processTransactionQueued: stores the timelock task as not executed', async () => {
    await expect(service.processTransactionQueued(TIMELOCK_EVENT)).resolves.toBeUndefined();

    expect(timelockTasks.create).toHaveBeenCalledTimes(1);
    // The task carries the envelope of the queuing event as well.
    expect(timelockTasks.create).toHaveBeenCalledWith({
      txHash: '0xtimelock1',
      target: '0xTreasury',
      data: '0xdeadbeef',
      eta: 1_700_090_000,
      chainId: '1',
      transactionHash: '0xtx6',
      logIndex: 3,
      blockNumber: 123_456,
    });

    const [storedTask] = Array.from(timelockTasks.store.values());
    expect(storedTask.executed).toBe(false);
    expect(storedTask.cancelled).toBe(false);
  });

  test('processTransactionExecuted: flips executed on the queued task', async () => {
    const queued = await timelockTasks.create({
      txHash: '0xtimelock1',
      target: '0xTreasury',
      data: '0xdeadbeef',
      eta: 1_700_090_000,
      chainId: '1',
      transactionHash: '0xtx6',
      logIndex: 3,
      blockNumber: 123_456,
    });
    expect(queued.executed).toBe(false);

    await service.processTransactionExecuted(asEvent({ ...TIMELOCK_EVENT, transactionHash: '0xtx7', logIndex: 5 }));

    expect(timelockTasks.updateExecuted).toHaveBeenCalledTimes(1);
    expect(timelockTasks.updateExecuted).toHaveBeenCalledWith('1', '0xtimelock1', true);
    expect(queued.executed).toBe(false); // the stored copy is replaced, not mutated
    expect(timelockTasks.store.get('0xtimelock1')?.executed).toBe(true);
  });

  test('processTransactionCancelled: marks the stored task cancelled', async () => {
    await timelockTasks.create({
      txHash: '0xtimelock1',
      target: '0xTreasury',
      data: '0xdeadbeef',
      eta: 1_700_090_000,
      chainId: '1',
      transactionHash: '0xtx6',
      logIndex: 3,
      blockNumber: 123_456,
    });

    await expect(service.processTransactionCancelled(TIMELOCK_EVENT)).resolves.toBeUndefined();

    expect(timelockTasks.updateCancelled).toHaveBeenCalledTimes(1);
    expect(timelockTasks.updateCancelled).toHaveBeenCalledWith('1', '0xtimelock1');
    expect(timelockTasks.store.get('0xtimelock1')?.cancelled).toBe(true);
  });

  test('processTreasuryWithdrawal: maps `to` to recipient and stores the withdrawal', async () => {
    await expect(
      service.processTreasuryWithdrawal(
        asEvent({
          data: {
            emittedFrom: '0xTreasury',
            to: '0xBob',
            token: '0xToken',
            amount: '500',
          },
          chainId: '1',
          transactionHash: '0xtx8',
          logIndex: 5,
          blockNumber: 123_456,
        }),
      ),
    ).resolves.toBeUndefined();

    expect(treasuryWithdrawals.create).toHaveBeenCalledTimes(1);
    expect(treasuryWithdrawals.create).toHaveBeenCalledWith({
      recipient: '0xBob',
      token: '0xToken',
      amount: '500',
      chainId: '1',
      transactionHash: '0xtx8',
      logIndex: 5,
    });
  });

  test('getProposals: forwards filter/sort/pagination and maps every proposal to plain JSON', async () => {
    const created = await proposals.create(PROPOSAL);
    await proposals.create({ ...PROPOSAL, proposalId: '8', chainId: '137', transactionHash: '0xtx9' });

    const result = await service.getProposals({
      filter: { chainId: '1' },
      sort: { createdAt: 'desc' },
      limit: 10,
      offset: 0,
    });

    expect(proposals.findAll).toHaveBeenCalledWith({ chainId: '1' }, { createdAt: 'desc' }, 10, 0);
    expect(result).toHaveLength(1);

    const [proposal] = result;
    expect(proposal.id).toBe(created._id.toString());
    expect(proposal.id).toHaveLength(24); // Mongo ObjectId hex
    expect(proposal).toMatchObject({
      proposalId: '7',
      proposer: '0xAlice',
      target: '0xTreasury',
      state: 'pending',
      chainId: '1',
      logIndex: 4,
    });
    expect(proposal).not.toHaveProperty('_id');
    // The result must be plain JSON — no ObjectId or class instances leaking to the caller.
    expect(JSON.parse(JSON.stringify(proposal))).toEqual(proposal);
  });

  test('getProposals: passes undefined filter/sort/limit/offset through when omitted', async () => {
    const result = await service.getProposals({});

    expect(proposals.findAll).toHaveBeenCalledWith(undefined, undefined, undefined, undefined);
    expect(result).toEqual([]);
  });

  test('getProposals: a stored proposal without a state maps state to undefined', async () => {
    // mapProposal uses `proposal.state ?? undefined`; the entity default is
    // 'pending', so this branch only shows up for legacy documents.
    const id = new Types.ObjectId();
    const timestamp = Math.floor(Date.now() / 1000);
    proposals.store.set(id.toString(), {
      _id: id,
      ...PROPOSAL,
      state: undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    } as unknown as FakeProposalDoc);

    const [proposal] = await service.getProposals({});

    expect(proposal.state).toBeUndefined();
  });

  test('getVotes: maps ids and weight to strings', async () => {
    const created = await votes.create({
      proposalId: '7',
      chainId: '1',
      governanceAddress: '0xGovernance',
      voterWallet: '0xCarol',
      support: true,
      weight: '123.45',
      reason: 'Good proposal',
      transactionHash: '0xtx3',
      logIndex: 0,
      blockNumber: 42,
    });

    const result = await service.getVotes({ filter: { proposalId: '7' } });

    expect(votes.findAll).toHaveBeenCalledWith({ proposalId: '7' }, undefined, undefined, undefined);
    expect(result).toHaveLength(1);

    const [vote] = result;
    expect(vote).toMatchObject({
      id: created._id.toString(),
      proposalId: '7',
      voterWallet: '0xCarol',
      support: true,
      weight: '123.45',
      blockNumber: 42,
    });
    expect(typeof vote.weight).toBe('string');
    expect(vote).not.toHaveProperty('_id');
    expect(JSON.parse(JSON.stringify(vote))).toEqual(vote);
  });

  test('getStakingHistory: maps amount to a string and keeps the operation', async () => {
    const created = await stakingHistory.create({
      staker: '0xBob',
      amount: '75.5',
      rewards: '0',
      operation: 'staked',
      chainId: '1',
      transactionHash: '0xtx10',
      logIndex: 0,
      blockNumber: 123_456,
    });

    const result = await service.getStakingHistory({ filter: { staker: '0xBob' } });

    expect(stakingHistory.findAll).toHaveBeenCalledWith({ staker: '0xBob' }, undefined, undefined, undefined);
    expect(result).toHaveLength(1);

    const [history] = result;
    expect(history).toMatchObject({
      id: created._id.toString(),
      staker: '0xBob',
      amount: '75.5',
      rewards: '0',
      operation: 'staked',
      chainId: '1',
      transactionHash: '0xtx10',
      logIndex: 0,
      blockNumber: 123_456,
    });
    expect(typeof history.amount).toBe('string');
    expect(history).not.toHaveProperty('_id');
    expect(JSON.parse(JSON.stringify(history))).toEqual(history);
  });

  test('getTimelockTasks: maps the executed flag and timestamps', async () => {
    const created = await timelockTasks.create({
      txHash: '0xtimelock1',
      target: '0xTreasury',
      data: '0xdeadbeef',
      eta: 1_700_090_000,
      chainId: '1',
      transactionHash: '0xtx6',
      logIndex: 3,
      blockNumber: 123_456,
    });

    const [task] = await service.getTimelockTasks({ filter: { chainId: '1' } });

    expect(task).toMatchObject({
      id: created._id.toString(),
      txHash: '0xtimelock1',
      target: '0xTreasury',
      data: '0xdeadbeef',
      eta: 1_700_090_000,
      executed: false,
      cancelled: false,
      chainId: '1',
      transactionHash: '0xtx6',
      logIndex: 3,
      blockNumber: 123_456,
    });
    expect(task).not.toHaveProperty('_id');

    await timelockTasks.updateExecuted('1', '0xtimelock1', true);

    const [executedTask] = await service.getTimelockTasks({});
    expect(executedTask.executed).toBe(true);
  });

  test('getTreasuryWithdrawals: maps recipient, token and amount', async () => {
    const created = await treasuryWithdrawals.create({
      recipient: '0xBob',
      token: '0xToken',
      amount: '500',
      chainId: '1',
      transactionHash: '0xtx8',
      logIndex: 5,
    });

    const result = await service.getTreasuryWithdrawals({ filter: { recipient: '0xBob' } });

    expect(result).toHaveLength(1);

    const [withdrawal] = result;
    expect(withdrawal).toMatchObject({
      id: created._id.toString(),
      recipient: '0xBob',
      token: '0xToken',
      isNative: false,
      amount: '500',
      chainId: '1',
      transactionHash: '0xtx8',
      logIndex: 5,
    });
    expect(typeof withdrawal.amount).toBe('string');
    expect(withdrawal).not.toHaveProperty('_id');
    expect(JSON.parse(JSON.stringify(withdrawal))).toEqual(withdrawal);
  });

  test('getTreasuryWithdrawals: a zero-address token is flagged as native', async () => {
    await treasuryWithdrawals.create({
      recipient: '0xBee',
      token: '0x0000000000000000000000000000000000000000',
      amount: '7',
      chainId: '1',
      transactionHash: '0xtx13',
      logIndex: 6,
    });

    const [native] = await service.getTreasuryWithdrawals({});

    expect(native.token).toBe('0x0000000000000000000000000000000000000000');
    expect(native.isNative).toBe(true);
  });

  test('getStaking: maps the mirrored amount, unlock timestamp and lastStakeTimestamp', async () => {
    await staking.setAmount('0xBob', '1', '999.5', 1_700_000_000);
    await staking.setUnlockTimestamp('0xBob', '1', 1_700_086_400);

    const result = await service.getStaking({ filter: { staker: '0xBob' } });

    expect(staking.findAll).toHaveBeenCalledWith({ staker: '0xBob' }, undefined, undefined, undefined);
    expect(result).toHaveLength(1);

    const [record] = result;
    expect(record).toMatchObject({
      staker: '0xBob',
      amount: '999.5',
      unlockTimestamp: 1_700_086_400,
      lastStakeTimestamp: 1_700_000_000,
      chainId: '1',
    });
    expect(typeof record.amount).toBe('string');
    expect(record).not.toHaveProperty('_id');
    expect(JSON.parse(JSON.stringify(record))).toEqual(record);
  });

  test('processProposalCreated: propagates an AppError thrown by the repository', async () => {
    proposals.create.mockImplementationOnce(async () => {
      throw new AppError({ message: 'Proposal 7 already exists', statusCode: 409, code: 'CONFLICT' });
    });

    await expect(service.processProposalCreated(PROPOSAL_CREATED_EVENT)).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONFLICT',
      message: 'Proposal 7 already exists',
    });
  });

  test('getProposals: propagates an AppError thrown by the repository', async () => {
    proposals.findAll.mockImplementationOnce(async () => {
      throw new AppError({ message: 'Proposal collection unavailable', statusCode: 503, code: 'SERVICE_UNAVAILABLE' });
    });

    await expect(service.getProposals({})).rejects.toMatchObject({
      statusCode: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Proposal collection unavailable',
    });
  });
});
