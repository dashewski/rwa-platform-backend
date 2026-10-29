/**
 * In-memory fake of BusinessService for daemon tests.
 *
 * Every method takes the commit closure the inbox daemon passes down and
 * commits the marker; the assertions are about routing, not behaviour.
 */
import { mock } from 'bun:test';

type CommitInbox = () => Promise<void>;
type Event = Record<string, unknown>;

const commit = async (commitInbox: CommitInbox): Promise<Record<string, never>> => {
  await commitInbox();
  return {};
};

export function createFakeBusinessService() {
  return {
    syncAfterDeployment: mock(async (_eventData: Event, commitInbox: CommitInbox) => commit(commitInbox)),

    syncPausedState: mock(async (_eventData: Event, commitInbox: CommitInbox) => commit(commitInbox)),

    applyEvaluationResult: mock(async (_result: Event, commitInbox: CommitInbox) => commit(commitInbox)),

    setRiskScore: mock(async (_params: { id: string; riskScore: number }, commitInbox: CommitInbox) =>
      commit(commitInbox),
    ),
  };
}

export type FakeBusinessService = ReturnType<typeof createFakeBusinessService>;
