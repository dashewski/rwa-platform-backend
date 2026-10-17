/**
 * Component tests for the dao HTTP layer.
 *
 * The whole Elysia app is assembled in-process: real controllers and the real
 * DaoService, with repositories replaced by in-memory fakes. Requests go
 * through app.handle() — no port is bound, nothing is
 * queried over the network. Run with `bun test` from services/dao.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { ErrorHandlerPlugin } from '@shared/errors/error-handler.plugin';
import { AppError } from '@shared/errors/app-errors';
import { createServicesPlugin } from '../src/plugins/services.plugin';
import { createControllersPlugin } from '../src/plugins/controllers.plugin';
import type { RepositoriesPlugin } from '../src/plugins/repositories.plugin';
import { createFakeProposalRepository, type FakeProposalRepository } from './fakes/proposal.repository.fake';
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

const VOTE = {
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
};

const STAKING_HISTORY = {
  staker: '0xBob',
  amount: '250',
  rewards: '0',
  operation: 'staked' as const,
  chainId: '1',
  transactionHash: '0xtx4',
  logIndex: 1,
  blockNumber: 123_456,
};

const TIMELOCK_TASK = {
  txHash: '0xtimelock1',
  target: '0xTreasury',
  data: '0xdeadbeef',
  eta: 1_700_090_000,
  chainId: '1',
  transactionHash: '0xtx6',
  logIndex: 3,
  blockNumber: 123_456,
};

const TREASURY_WITHDRAWAL = {
  recipient: '0xBob',
  token: '0xToken',
  amount: '500',
  chainId: '1',
  transactionHash: '0xtx8',
  logIndex: 5,
};

function buildApp(
  proposals: FakeProposalRepository,
  votes: FakeVoteRepository,
  staking: FakeStakingRepository,
  stakingHistory: FakeStakingHistoryRepository,
  timelockTasks: FakeTimelockTaskRepository,
  treasuryWithdrawals: FakeTreasuryWithdrawRepository,
) {
  const repositoriesPlugin = new Elysia({ name: 'Repositories' })
    .decorate('proposalRepository', proposals)
    .decorate('voteRepository', votes)
    .decorate('stakingRepository', staking)
    .decorate('stakingHistoryRepository', stakingHistory)
    .decorate('timelockTaskRepository', timelockTasks)
    .decorate('treasuryWithdrawRepository', treasuryWithdrawals);

  const servicesPlugin = createServicesPlugin(repositoriesPlugin as unknown as RepositoriesPlugin);

  return new Elysia().onError(ErrorHandlerPlugin).use(createControllersPlugin(servicesPlugin));
}

type App = ReturnType<typeof buildApp>;

async function post(app: App, path: string, body: unknown) {
  const response = await app.handle(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

  return { status: response.status, body: (await response.json()) as any };
}

describe('dao HTTP layer (component, fake repositories)', () => {
  let proposals: FakeProposalRepository;
  let votes: FakeVoteRepository;
  let staking: FakeStakingRepository;
  let stakingHistory: FakeStakingHistoryRepository;
  let timelockTasks: FakeTimelockTaskRepository;
  let treasuryWithdrawals: FakeTreasuryWithdrawRepository;
  let app: App;

  beforeEach(() => {
    proposals = createFakeProposalRepository();
    votes = createFakeVoteRepository();
    staking = createFakeStakingRepository();
    stakingHistory = createFakeStakingHistoryRepository();
    timelockTasks = createFakeTimelockTaskRepository();
    treasuryWithdrawals = createFakeTreasuryWithdrawRepository();
    app = buildApp(proposals, votes, staking, stakingHistory, timelockTasks, treasuryWithdrawals);
  });

  test('getProposals: an empty collection returns 200 and an empty array', async () => {
    const response = await post(app, '/getProposals', {});

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  test('getProposals: seeded proposals come back as plain JSON with string ids', async () => {
    const created = await proposals.create(PROPOSAL);

    const response = await post(app, '/getProposals', {});

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      proposalId: '7',
      proposer: '0xAlice',
      creationTime: 1_700_000_000,
      state: 'pending',
      chainId: '1',
      logIndex: 4,
    });
    expect(response.body[0].id).toBe(created._id.toString());
    expect(response.body[0]).not.toHaveProperty('_id');
    expect(JSON.parse(JSON.stringify(response.body))).toEqual(response.body);
  });

  test('getProposals: filter is forwarded end-to-end', async () => {
    await proposals.create(PROPOSAL);
    await proposals.create({ ...PROPOSAL, proposalId: '8', chainId: '137', transactionHash: '0xtx9' });

    const response = await post(app, '/getProposals', { filter: { chainId: '137' } });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].proposalId).toBe('8');
  });

  test('getProposals: limit and offset are forwarded', async () => {
    await proposals.create(PROPOSAL);
    await proposals.create({ ...PROPOSAL, proposalId: '8', transactionHash: '0xtx9' });

    const response = await post(app, '/getProposals', { limit: 1, offset: 1 });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].proposalId).toBe('8'); // insertion order is stable in the fake
  });

  test('getVotes: the vote comes back with a string weight', async () => {
    await votes.create(VOTE);

    const response = await post(app, '/getVotes', { filter: { proposalId: '7' } });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      proposalId: '7',
      voterWallet: '0xCarol',
      support: true,
      weight: '123.45',
      blockNumber: 42,
    });
    expect(typeof response.body[0].weight).toBe('string');
  });

  test('getStakingHistory: the history row keeps amount and operation', async () => {
    await stakingHistory.create(STAKING_HISTORY);

    const response = await post(app, '/getStakingHistory', { filter: { staker: '0xBob' } });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      staker: '0xBob',
      amount: '250',
      rewards: '0',
      operation: 'staked',
      chainId: '1',
      transactionHash: '0xtx4',
      blockNumber: 123_456,
    });
    expect(response.body[0]).not.toHaveProperty('_id');
  });

  test('getTimelockTasks: executed flips once the task is marked executed', async () => {
    await timelockTasks.create(TIMELOCK_TASK);

    const pending = await post(app, '/getTimelockTasks', { filter: { chainId: '1' } });
    expect(pending.status).toBe(200);
    expect(pending.body).toHaveLength(1);
    expect(pending.body[0]).toMatchObject({
      txHash: '0xtimelock1',
      target: '0xTreasury',
      eta: 1_700_090_000,
      executed: false,
      cancelled: false,
      transactionHash: '0xtx6',
      logIndex: 3,
      blockNumber: 123_456,
    });

    await timelockTasks.updateExecuted('1', '0xtimelock1', true);

    const executed = await post(app, '/getTimelockTasks', {});
    expect(executed.status).toBe(200);
    expect(executed.body[0].executed).toBe(true);
  });

  test('getTreasuryWithdrawals: recipient, token and amount are mapped', async () => {
    await treasuryWithdrawals.create(TREASURY_WITHDRAWAL);

    const response = await post(app, '/getTreasuryWithdrawals', { filter: { recipient: '0xBob' } });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      recipient: '0xBob',
      token: '0xToken',
      isNative: false,
      amount: '500',
      chainId: '1',
      transactionHash: '0xtx8',
    });
  });

  test('getStaking: the record exposes the mirrored amount and the lock timestamp', async () => {
    await staking.setAmount('0xBob', '1', '150.5', 1_700_000_100);
    await staking.setUnlockTimestamp('0xBob', '1', 1_700_086_400);

    const response = await post(app, '/getStaking', { filter: { staker: '0xBob' } });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      staker: '0xBob',
      amount: '150.5',
      unlockTimestamp: 1_700_086_400,
      lastStakeTimestamp: 1_700_000_100,
      chainId: '1',
    });
    expect(typeof response.body[0].amount).toBe('string');
  });

  test('a repository AppError maps to its status code and error body', async () => {
    votes.findAll.mockImplementationOnce(async () => {
      throw new AppError({ message: 'Vote index unavailable', statusCode: 503, code: 'SERVICE_UNAVAILABLE' });
    });

    const response = await post(app, '/getVotes', {});

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Vote index unavailable' } });
  });

  test('an invalid body never reaches the repository', async () => {
    const response = await post(app, '/getProposals', { limit: 'ten' });

    expect(response.status).not.toBe(200);
    expect(proposals.findAll).toHaveBeenCalledTimes(0);
  });
});
