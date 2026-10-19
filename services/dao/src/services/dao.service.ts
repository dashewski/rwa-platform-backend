import { ProposalRepository } from '../repositories/proposal.repository';
import { StakingRepository } from '../repositories/staking.repository';
import { StakingHistoryRepository } from '../repositories/stakingHistory.repository';
import { TimelockTaskRepository } from '../repositories/timelockTask.repository';
import { TreasuryWithdrawRepository } from '../repositories/treasuryWithdraw.repository';
import { VoteRepository } from '../repositories/vote.repository';
import type { SortOrder } from 'mongoose';
import type { IProposalEntity } from '../models/entity/proposal.entity';
import type { IVoteEntity } from '../models/entity/vote.entity';
import type { IStakingHistoryEntity } from '../models/entity/stakingHistory.entity';
import type { ITimelockTaskEntity } from '../models/entity/timelockTask.entity';
import type { ITreasuryWithdrawEntity } from '../models/entity/treasuryWithdraw.entity';
import type { IStakingEntity } from '../models/entity/staking.entity';
import type { BlockchainEvent } from '@shared/blockchain';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import { MetricsDecorator } from '@shared/monitoring/src/metricsDecorator';
import { LogDecorator } from '@shared/monitoring/src/logDecorator';
import { setSpanAttributes } from '@shared/monitoring/src/tracing';

/**
 * DAO event handlers.
 *
 * Handlers receive the full blockchain event: decoded contract fields live in
 * `event.data` (exactly as the contracts emit them), while the envelope
 * (chainId, transactionHash, logIndex, blockNumber) sits on the root.
 */
export class DaoService {
  constructor(
    private readonly proposalRepository: ProposalRepository,
    private readonly stakingRepository: StakingRepository,
    private readonly stakingHistoryRepository: StakingHistoryRepository,
    private readonly timelockTaskRepository: TimelockTaskRepository,
    private readonly treasuryWithdrawRepository: TreasuryWithdrawRepository,
    private readonly voteRepository: VoteRepository,
  ) {}

  /**
   * Process Governance_ProposalCreated event
   */
  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({
      emittedFrom: a[0].data.emittedFrom,
      proposalId: a[0].data.proposalId,
      chainId: a[0].chainId,
      transactionHash: a[0].transactionHash,
      logIndex: a[0].logIndex,
    }),
  })
  async processProposalCreated(event: BlockchainEvent<{
      emittedFrom: string;
      proposalId: string;
      proposer: string;
      target: string;
      data: string;
      description: string;
      creationTime: string;
      endTime: string;
  }>) {
    setSpanAttributes({
      wallet: event.data.proposer,
      proposalId: event.data.proposalId,
      chainId: String(event.chainId),
      transactionHash: event.transactionHash,
    });
    await this.proposalRepository.create({
      proposalId: event.data.proposalId,
      proposer: event.data.proposer,
      target: event.data.target,
      data: event.data.data,
      description: event.data.description,
      creationTime: Number(event.data.creationTime),
      endTime: Number(event.data.endTime),
      chainId: String(event.chainId),
      transactionHash: event.transactionHash,
      logIndex: event.logIndex,
    });
  }

  /**
   * Process Governance_ProposalExecuted event
   */
  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({
      emittedFrom: a[0].data.emittedFrom,
      proposalId: a[0].data.proposalId,
      chainId: a[0].chainId,
      transactionHash: a[0].transactionHash,
      logIndex: a[0].logIndex,
    }),
  })
  async processProposalExecuted(event: BlockchainEvent<{
      emittedFrom: string;
      proposalId: string;
      executor: string;
  }>) {
    setSpanAttributes({
      wallet: event.data.executor,
      proposalId: event.data.proposalId,
      chainId: String(event.chainId),
      transactionHash: event.transactionHash,
    });
    await this.proposalRepository.updateState(event.data.proposalId, 'executed', {
      executor: event.data.executor,
    });
  }

  /**
   * Process Governance_ProposalCancelled event
   */
  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({
      emittedFrom: a[0].data.emittedFrom,
      proposalId: a[0].data.proposalId,
      chainId: a[0].chainId,
      transactionHash: a[0].transactionHash,
      logIndex: a[0].logIndex,
    }),
  })
  async processProposalCancelled(event: BlockchainEvent<{
      emittedFrom: string;
      proposalId: string;
      canceller: string;
  }>) {
    setSpanAttributes({
      wallet: event.data.canceller,
      proposalId: event.data.proposalId,
      chainId: String(event.chainId),
      transactionHash: event.transactionHash,
    });
    await this.proposalRepository.updateState(event.data.proposalId, 'canceled', {
      canceller: event.data.canceller,
    });
  }

  /**
   * Process Governance_VoteCast event
   */
  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({
      emittedFrom: a[0].data.emittedFrom,
      proposalId: a[0].data.proposalId,
      chainId: a[0].chainId,
      transactionHash: a[0].transactionHash,
      logIndex: a[0].logIndex,
    }),
  })
  async processVoteCast(event: BlockchainEvent<{
      emittedFrom: string;
      proposalId: string;
      voter: string;
      support: boolean;
      weight: string;
      reason: string;
  }>) {
    setSpanAttributes({
      voter: event.data.voter,
      proposalId: event.data.proposalId,
      chainId: String(event.chainId),
      transactionHash: event.transactionHash,
    });
    await this.voteRepository.create({
      proposalId: event.data.proposalId,
      chainId: String(event.chainId),
      governanceAddress: event.data.emittedFrom,
      voterWallet: event.data.voter,
      support: event.data.support,
      weight: event.data.weight,
      reason: event.data.reason,
      transactionHash: event.transactionHash,
      logIndex: event.logIndex,
      blockNumber: event.blockNumber,
    });
  }

  /**
   * Process DaoStaking_TokensStaked event
   */
  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({
      emittedFrom: a[0].data.emittedFrom,
      staker: a[0].data.staker,
      chainId: a[0].chainId,
      transactionHash: a[0].transactionHash,
      logIndex: a[0].logIndex,
    }),
  })
  async processTokensStaked(event: BlockchainEvent<{
    emittedFrom: string;
    staker: string;
    amount: string;
    newVotingPower: string;
  }>) {
    setSpanAttributes({
      wallet: event.data.staker,
      chainId: String(event.chainId),
      transactionHash: event.transactionHash,
    });
    // The event carries the full post-event stake (= on-chain stakedAmount,
    // rewards reinvested), so mirror the amount as-is instead of accumulating
    // deltas; events arrive strictly in chain order.
    await this.stakingRepository.setAmount(
      event.data.staker,
      String(event.chainId),
      event.data.newVotingPower,
      event.timestamp,
    );

    // Record staking history
    await this.stakingHistoryRepository.create({
      staker: event.data.staker,
      amount: event.data.amount,
      rewards: '0',
      operation: 'staked',
      chainId: String(event.chainId),
      transactionHash: event.transactionHash,
      logIndex: event.logIndex,
      blockNumber: event.blockNumber,
    });
  }

  /**
   * Process DaoStaking_TokensUnstaked event
   */
  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({
      emittedFrom: a[0].data.emittedFrom,
      staker: a[0].data.staker,
      chainId: a[0].chainId,
      transactionHash: a[0].transactionHash,
      logIndex: a[0].logIndex,
    }),
  })
  async processTokensUnstaked(event: BlockchainEvent<{
    emittedFrom: string;
    staker: string;
    amount: string;
    rewardsReceived: string;
    newVotingPower: string;
  }>) {
    setSpanAttributes({
      wallet: event.data.staker,
      chainId: String(event.chainId),
      transactionHash: event.transactionHash,
    });
    // Mirror the absolute stake amount from the event. A partial unstake
    // reinvests the remainder and resets the contract stakingTimestamp, so
    // lastStakeTimestamp moves with it; a full exit leaves it untouched.
    const newVotingPower = String(event.data.newVotingPower);
    await this.stakingRepository.setAmount(
      event.data.staker,
      String(event.chainId),
      newVotingPower,
      BigInt(newVotingPower) === 0n ? undefined : event.timestamp,
    );

    // Record staking history
    await this.stakingHistoryRepository.create({
      staker: event.data.staker,
      amount: event.data.amount,
      rewards: event.data.rewardsReceived,
      operation: 'unstaked',
      chainId: String(event.chainId),
      transactionHash: event.transactionHash,
      logIndex: event.logIndex,
      blockNumber: event.blockNumber,
    });
  }

  /**
   * Process DaoStaking_TokensLocked event
   */
  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({
      emittedFrom: a[0].data.emittedFrom,
      user: a[0].data.user,
      chainId: a[0].chainId,
      transactionHash: a[0].transactionHash,
      logIndex: a[0].logIndex,
    }),
  })
  async processTokensLocked(event: BlockchainEvent<{
    emittedFrom: string;
    user: string;
    unlockTimestamp: string;
  }>) {
    setSpanAttributes({
      wallet: event.data.user,
      chainId: String(event.chainId),
      transactionHash: event.transactionHash,
    });
    // Governance locks the voter's stake until the proposal end; the event
    // carries the resulting votingLockTimestamp (the max of all prior locks).
    await this.stakingRepository.setUnlockTimestamp(
      event.data.user,
      String(event.chainId),
      Number(event.data.unlockTimestamp),
    );
  }

  /**
   * Process Timelock_TransactionQueued event
   */
  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({
      emittedFrom: a[0].data.emittedFrom,
      txHash: a[0].data.txHash,
      chainId: a[0].chainId,
      transactionHash: a[0].transactionHash,
      logIndex: a[0].logIndex,
    }),
  })
  async processTransactionQueued(event: BlockchainEvent<{
    emittedFrom: string;
    txHash: string;
    target: string;
    data: string;
    eta: string;
  }>) {
    setSpanAttributes({
      chainId: String(event.chainId),
      transactionHash: event.transactionHash,
    });
    await this.timelockTaskRepository.create({
      txHash: event.data.txHash,
      target: event.data.target,
      data: event.data.data,
      eta: Number(event.data.eta),
      chainId: String(event.chainId),
      transactionHash: event.transactionHash,
      logIndex: event.logIndex,
      blockNumber: event.blockNumber,
    });
  }

  /**
   * Process Timelock_TransactionExecuted event
   */
  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({
      emittedFrom: a[0].data.emittedFrom,
      txHash: a[0].data.txHash,
      chainId: a[0].chainId,
      transactionHash: a[0].transactionHash,
      logIndex: a[0].logIndex,
    }),
  })
  async processTransactionExecuted(event: BlockchainEvent<{
      emittedFrom: string;
      txHash: string;
      target: string;
      data: string;
      eta: string;
  }>) {
    setSpanAttributes({
      chainId: String(event.chainId),
      transactionHash: event.transactionHash,
    });
    await this.timelockTaskRepository.updateExecuted(String(event.chainId), event.data.txHash, true);
  }

  /**
   * Process Timelock_TransactionCancelled event
   */
  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({
      emittedFrom: a[0].data.emittedFrom,
      txHash: a[0].data.txHash,
      chainId: a[0].chainId,
      transactionHash: a[0].transactionHash,
      logIndex: a[0].logIndex,
    }),
  })
  async processTransactionCancelled(event: BlockchainEvent<{
      emittedFrom: string;
      txHash: string;
      target: string;
      data: string;
      eta: string;
  }>) {
    setSpanAttributes({
      chainId: String(event.chainId),
      transactionHash: event.transactionHash,
    });
    // Mirror the chain: the timelock deletes the transaction from
    // queuedTransactions, so the task must stop counting as pending.
    await this.timelockTaskRepository.updateCancelled(String(event.chainId), event.data.txHash);
  }

  /**
   * Process Treasury_Withdrawal event
   */
  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({
      emittedFrom: a[0].data.emittedFrom,
      to: a[0].data.to,
      chainId: a[0].chainId,
      transactionHash: a[0].transactionHash,
      logIndex: a[0].logIndex,
    }),
  })
  async processTreasuryWithdrawal(event: BlockchainEvent<{
      emittedFrom: string;
      to: string;
      token: string;
      amount: string;
  }>) {
    setSpanAttributes({
      wallet: event.data.to,
      chainId: String(event.chainId),
      transactionHash: event.transactionHash,
    });
    await this.treasuryWithdrawRepository.create({
      recipient: event.data.to,
      token: event.data.token,
      amount: event.data.amount,
      chainId: String(event.chainId),
      transactionHash: event.transactionHash,
      logIndex: event.logIndex,
    });
  }

  // Mapping methods
  private mapProposal(proposal: IProposalEntity) {
    return {
      id: proposal._id.toString(),
      proposalId: proposal.proposalId,
      proposer: proposal.proposer,
      target: proposal.target,
      data: proposal.data,
      description: proposal.description,
      creationTime: proposal.creationTime,
      endTime: proposal.endTime,
      state: proposal.state ?? undefined,
      executor: proposal.executor ?? undefined,
      canceller: proposal.canceller ?? undefined,
      chainId: proposal.chainId,
      transactionHash: proposal.transactionHash,
      logIndex: proposal.logIndex,
      createdAt: proposal.createdAt,
      updatedAt: proposal.updatedAt,
    };
  }

  private mapVote(vote: IVoteEntity) {
    return {
      id: vote._id.toString(),
      proposalId: vote.proposalId,
      chainId: vote.chainId,
      governanceAddress: vote.governanceAddress,
      voterWallet: vote.voterWallet,
      support: vote.support,
      weight: vote.weight.toString(),
      reason: vote.reason,
      transactionHash: vote.transactionHash,
      logIndex: vote.logIndex,
      blockNumber: vote.blockNumber,
      createdAt: vote.createdAt,
      updatedAt: vote.updatedAt,
    };
  }

  private mapStakingHistory(stakingHistory: IStakingHistoryEntity) {
    return {
      id: stakingHistory._id.toString(),
      staker: stakingHistory.staker,
      amount: stakingHistory.amount.toString(),
      rewards: stakingHistory.rewards?.toString() ?? '0',
      operation: stakingHistory.operation,
      chainId: stakingHistory.chainId,
      transactionHash: stakingHistory.transactionHash,
      logIndex: stakingHistory.logIndex,
      blockNumber: stakingHistory.blockNumber,
      createdAt: stakingHistory.createdAt,
      updatedAt: stakingHistory.updatedAt,
    };
  }

  private mapTimelockTask(timelockTask: ITimelockTaskEntity) {
    return {
      id: timelockTask._id.toString(),
      txHash: timelockTask.txHash,
      target: timelockTask.target,
      data: timelockTask.data,
      eta: timelockTask.eta,
      executed: timelockTask.executed,
      cancelled: timelockTask.cancelled ?? false,
      chainId: timelockTask.chainId,
      transactionHash: timelockTask.transactionHash,
      logIndex: timelockTask.logIndex,
      blockNumber: timelockTask.blockNumber,
      createdAt: timelockTask.createdAt,
      updatedAt: timelockTask.updatedAt,
    };
  }

  private mapTreasuryWithdraw(treasuryWithdraw: ITreasuryWithdrawEntity) {
    return {
      id: treasuryWithdraw._id.toString(),
      recipient: treasuryWithdraw.recipient,
      token: treasuryWithdraw.token,
      isNative: String(treasuryWithdraw.token ?? '').toLowerCase() === '0x0000000000000000000000000000000000000000',
      amount: treasuryWithdraw.amount.toString(),
      chainId: treasuryWithdraw.chainId,
      transactionHash: treasuryWithdraw.transactionHash,
      logIndex: treasuryWithdraw.logIndex,
      createdAt: treasuryWithdraw.createdAt,
      updatedAt: treasuryWithdraw.updatedAt,
    };
  }

  private mapStaking(staking: IStakingEntity) {
    return {
      id: staking._id.toString(),
      staker: staking.staker,
      amount: staking.amount.toString(),
      unlockTimestamp: staking.unlockTimestamp ?? 0,
      lastStakeTimestamp: staking.lastStakeTimestamp,
      chainId: staking.chainId,
      createdAt: staking.createdAt,
      updatedAt: staking.updatedAt,
    };
  }

  /**
   * Get all proposals with pagination
   */
  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ limit: a[0].limit, offset: a[0].offset }),
  })
  async getProposals(params: {
    filter?: Record<string, any>;
    sort?: { [key: string]: SortOrder };
    limit?: number;
    offset?: number;
  }) {
    const proposals = await this.proposalRepository.findAll(params.filter, params.sort, params.limit, params.offset);

    return proposals.map((proposal) => this.mapProposal(proposal));
  }

  /**
   * Get all votes
   */
  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ limit: a[0].limit, offset: a[0].offset }),
  })
  async getVotes(params: {
    filter?: Record<string, any>;
    sort?: { [key: string]: SortOrder };
    limit?: number;
    offset?: number;
  }) {
    const votes = await this.voteRepository.findAll(params.filter, params.sort, params.limit, params.offset);

    return votes.map((vote) => this.mapVote(vote));
  }

  /**
   * Get staking history
   */
  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ limit: a[0].limit, offset: a[0].offset }),
  })
  async getStakingHistory(params: {
    filter?: Record<string, any>;
    sort?: { [key: string]: SortOrder };
    limit?: number;
    offset?: number;
  }) {
    const stakingHistory = await this.stakingHistoryRepository.findAll(
      params.filter,
      params.sort,
      params.limit,
      params.offset,
    );

    return stakingHistory.map((history) => this.mapStakingHistory(history));
  }

  /**
   * Get timelock tasks
   */
  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ limit: a[0].limit, offset: a[0].offset }),
  })
  async getTimelockTasks(params: {
    filter?: Record<string, any>;
    sort?: { [key: string]: SortOrder };
    limit?: number;
    offset?: number;
  }) {
    const timelockTasks = await this.timelockTaskRepository.findAll(
      params.filter,
      params.sort,
      params.limit,
      params.offset,
    );

    return timelockTasks.map((task) => this.mapTimelockTask(task));
  }

  /**
   * Get treasury withdrawals
   */
  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ limit: a[0].limit, offset: a[0].offset }),
  })
  async getTreasuryWithdrawals(params: {
    filter?: Record<string, any>;
    sort?: { [key: string]: SortOrder };
    limit?: number;
    offset?: number;
  }) {
    const treasuryWithdrawals = await this.treasuryWithdrawRepository.findAll(
      params.filter,
      params.sort,
      params.limit,
      params.offset,
    );

    return treasuryWithdrawals.map((withdrawal) => this.mapTreasuryWithdraw(withdrawal));
  }

  /**
   * Get staking records
   */
  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ limit: a[0].limit, offset: a[0].offset }),
  })
  async getStaking(params: {
    filter?: Record<string, any>;
    sort?: { [key: string]: SortOrder };
    limit?: number;
    offset?: number;
  }) {
    const stakingRecords = await this.stakingRepository.findAll(
      params.filter,
      params.sort,
      params.limit,
      params.offset,
    );

    return stakingRecords.map((staking) => this.mapStaking(staking));
  }
}
