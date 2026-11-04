/**
 * In-memory fake of EvaluationJobRepository for unit tests.
 *
 * The job collection is the service-local queue: the controller enqueues,
 * the worker daemon claims and finishes. Tests drive the same transitions
 * without MongoDB.
 */
import { mock } from 'bun:test';
import { Types } from 'mongoose';

export type FakeEvaluationJob = {
  _id: Types.ObjectId;
  evaluationId: Types.ObjectId;
  entityType: 'pool' | 'business';
  entityId: string;
  ownerId: string;
  ownerType: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  attempts: number;
  lockedUntil?: Date;
  error?: string;
};

export function createFakeEvaluationJobRepository() {
  const store = new Map<string, FakeEvaluationJob>();

  return {
    store,

    create: mock(async (data: Omit<FakeEvaluationJob, '_id' | 'attempts'> & { attempts?: number }) => {
      const job: FakeEvaluationJob = {
        ...data,
        _id: new Types.ObjectId(),
        attempts: data.attempts ?? 0,
      };
      store.set(String(job._id), job);
      return job;
    }),

    claimNext: mock(async (lockMs: number) => {
      const now = new Date();
      const job = [...store.values()].find(
        (item) =>
          (item.status === 'pending' || item.status === 'running') &&
          (item.lockedUntil === undefined || item.lockedUntil <= now),
      );

      if (!job) {
        return null;
      }

      job.status = 'running';
      job.attempts += 1;
      job.lockedUntil = new Date(Date.now() + lockMs);

      return job;
    }),

    complete: mock(async (id: string) => {
      const job = store.get(id);
      if (!job) throw new Error(`job ${id} not found`);

      job.status = 'completed';
      job.error = undefined;

      return job;
    }),

    release: mock(async (id: string, retryDelayMs: number, error: string) => {
      const job = store.get(id);
      if (!job) throw new Error(`job ${id} not found`);

      job.status = 'pending';
      job.error = error;
      job.lockedUntil = new Date(Date.now() + retryDelayMs);

      return job;
    }),

    fail: mock(async (id: string, error: string) => {
      const job = store.get(id);
      if (!job) throw new Error(`job ${id} not found`);

      job.status = 'failed';
      job.error = error;

      return job;
    }),
  };
}

export type FakeEvaluationJobRepository = ReturnType<typeof createFakeEvaluationJobRepository>;
