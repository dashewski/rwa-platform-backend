/**
 * In-memory fake of BusinessService for daemon tests.
 *
 * The daemons only route events into the service layer; those tests assert the
 * routing itself, so every public method used by the daemons is a bun:test
 * mock() with no real behaviour behind it.
 */
import { mock } from 'bun:test';

export function createFakeBusinessService() {
  return {
    syncAfterDeployment: mock(async (_eventData: Record<string, unknown>) => ({})),

    syncPausedState: mock(async (_eventData: Record<string, unknown>) => ({})),

    applyEvaluationResult: mock(async (_result: Record<string, unknown>) => ({})),

    setRiskScore: mock(async (_params: { id: string; riskScore: number }) => ({})),

    resetEvaluation: mock(async (_params: { id: string }) => ({})),
  };
}

export type FakeBusinessService = ReturnType<typeof createFakeBusinessService>;
