/**
 * In-memory fake of PoolService for daemon tests.
 *
 * Mirrors every public method the daemons route into; each method takes the
 * commit closure the inbox daemon passes down and commits the marker.
 */
import { mock } from 'bun:test';

type CommitInbox = () => Promise<void>;
type Event = Record<string, unknown>;

const commit = async (commitInbox: CommitInbox): Promise<Record<string, never>> => {
  await commitInbox();
  return {};
};

export function createFakePoolService() {
  return {
    syncPoolAfterDeployment: mock(async (_event: Event, commitInbox: CommitInbox) => commit(commitInbox)),
    syncPoolBonusWithdrawn: mock(async (_event: Event, commitInbox: CommitInbox) => commit(commitInbox)),
    syncPoolAwaitingRwaAmount: mock(async (_event: Event, commitInbox: CommitInbox) => commit(commitInbox)),
    syncPoolFundsFullyReturned: mock(async (_event: Event, commitInbox: CommitInbox) => commit(commitInbox)),
    syncPoolIncomingReturnSummary: mock(async (_event: Event, commitInbox: CommitInbox) => commit(commitInbox)),
    syncPoolIncomingTrancheUpdate: mock(async (_event: Event, commitInbox: CommitInbox) => commit(commitInbox)),
    syncPoolOutgoingClaimSummary: mock(async (_event: Event, commitInbox: CommitInbox) => commit(commitInbox)),
    syncPoolOutgoingTrancheClaimed: mock(async (_event: Event, commitInbox: CommitInbox) => commit(commitInbox)),
    syncPoolPausedState: mock(async (_event: Event, commitInbox: CommitInbox) => commit(commitInbox)),
    syncPoolReserves: mock(async (_event: Event, commitInbox: CommitInbox) => commit(commitInbox)),
    syncPoolTargetReached: mock(async (_event: Event, commitInbox: CommitInbox) => commit(commitInbox)),

    applyEvaluationResult: mock(async (_result: Event, commitInbox: CommitInbox) => commit(commitInbox)),

    setRiskScore: mock(async (_params: { id: string; riskScore: number }, commitInbox: CommitInbox) =>
      commit(commitInbox),
    ),
  };
}

export type FakePoolService = ReturnType<typeof createFakePoolService>;
