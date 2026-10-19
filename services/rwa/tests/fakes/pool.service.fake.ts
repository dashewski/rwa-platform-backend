/**
 * In-memory fake of PoolService for daemon tests.
 *
 * Mirrors every public method the blockchain events daemon routes into; the
 * methods are bun:test mock()s so the daemon tests assert routing only.
 */
import { mock } from 'bun:test';

export function createFakePoolService() {
  return {
    syncPoolAfterDeployment: mock(async (_event: Record<string, unknown>) => ({})),
    syncPoolBonusWithdrawn: mock(async (_event: Record<string, unknown>) => ({})),
    syncPoolAwaitingRwaAmount: mock(async (_event: Record<string, unknown>) => ({})),
    syncPoolFundsFullyReturned: mock(async (_event: Record<string, unknown>) => ({})),
    syncPoolIncomingReturnSummary: mock(async (_event: Record<string, unknown>) => ({})),
    syncPoolIncomingTrancheUpdate: mock(async (_event: Record<string, unknown>) => ({})),
    syncPoolOutgoingClaimSummary: mock(async (_event: Record<string, unknown>) => ({})),
    syncPoolOutgoingTrancheClaimed: mock(async (_event: Record<string, unknown>) => ({})),
    syncPoolPausedState: mock(async (_event: Record<string, unknown>) => ({})),
    syncPoolReserves: mock(async (_event: Record<string, unknown>) => ({})),
    syncPoolTargetReached: mock(async (_event: Record<string, unknown>) => ({})),

    applyEvaluationResult: mock(async (_result: Record<string, unknown>) => ({})),

    setRiskScore: mock(async (_params: { id: string; riskScore: number }) => ({})),
  };
}

export type FakePoolService = ReturnType<typeof createFakePoolService>;
