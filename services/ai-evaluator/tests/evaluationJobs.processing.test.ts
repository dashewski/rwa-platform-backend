/**
 * Unit tests for the job processing loop (processEvaluationJobs /
 * processEvaluationJob).
 *
 * The queue is a fake repository and evaluate* is replaced per test, so these
 * tests describe the queue semantics only: claim, concurrency, retries and the
 * final state. No Mongo, no broker, no HTTP.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import mongoose from 'mongoose';
import { RiskEvaluationService } from '../src/services/riskEvaluation.service';
import { createFakeEvaluationRepository } from './fakes/evaluation.repository.fake';
import { createFakeEdenClients } from './fakes/eden.clients.fake';
import { createFakeOpenRouterClient } from './fakes/openrouter.client.fake';
import { createFakeOutboxPublisher } from './fakes/outbox-publisher.fake';

const MODEL = 'test/model';
/** Mirrors the private constant of RiskEvaluationService. */
const EVALUATION_JOB_MAX_ATTEMPTS = 3;

type FakeJob = {
  _id: { toString: () => string };
  entityType: 'pool' | 'business';
  entityId: string;
  params: Record<string, unknown>;
  status: string;
  attempts: number;
};

function createJobQueue(jobs: FakeJob[]) {
  const pending = [...jobs];

  return {
    queue: pending,
    calls: { releaseProcessing: 0, claimNext: 0, markDone: [] as string[], markAttemptFailed: [] as string[] },

    create: mock(async (input: Record<string, unknown>) => ({ _id: { toString: () => 'job-new' }, ...input })),

    releaseProcessing: mock(async () => {
      pending.forEach((job) => {
        if (job.status === 'processing') job.status = 'pending';
      });
    }),

    claimNext: mock(async () => {
      const index = pending.findIndex((job) => job.status === 'pending');
      if (index === -1) return null;

      const job = pending[index];
      job.status = 'processing';

      return { ...job };
    }),

    markDone: mock(async (id: { toString: () => string }) => {
      const job = pending.find((candidate) => candidate._id.toString() === id.toString());
      if (job) job.status = 'done';
    }),

    markAttemptFailed: mock(async (id: { toString: () => string }, maxAttempts: number) => {
      const job = pending.find((candidate) => candidate._id.toString() === id.toString());
      if (!job) return null;

      job.attempts += 1;
      job.status = job.attempts >= maxAttempts ? 'failed' : 'pending';

      return { ...job };
    }),
  };
}

function makeJob(id: string, entityType: 'pool' | 'business' = 'pool'): FakeJob {
  return {
    _id: { toString: () => id },
    entityType,
    entityId: entityType === 'pool' ? `pool-${id}` : `business-${id}`,
    params:
      entityType === 'pool'
        ? { poolId: `pool-${id}`, ownerId: 'owner-1', ownerType: 'business' }
        : { businessId: `business-${id}`, ownerId: 'owner-1', ownerType: 'business' },
    status: 'pending',
    attempts: 0,
  };
}

describe('RiskEvaluationService job loop', () => {
  let originalTransaction: unknown;

  beforeEach(() => {
    originalTransaction = (mongoose.connection as unknown as { transaction: unknown }).transaction;
    (mongoose.connection as unknown as { transaction: unknown }).transaction = async <T>(fn: () => Promise<T>) =>
      await fn();
  });

  afterEach(() => {
    (mongoose.connection as unknown as { transaction: unknown }).transaction = originalTransaction;
  });

  function build(queue: ReturnType<typeof createJobQueue>) {
    const eden = createFakeEdenClients();

    return new RiskEvaluationService(
      createFakeEvaluationRepository() as never,
      queue as never,
      createFakeOpenRouterClient() as never,
      eden.rwaClient as never,
      eden.documentsClient as never,
      eden.galleryClient as never,
      eden.reactionsClient as never,
      eden.questionsClient as never,
      eden.portfolioClient as never,
      createFakeOutboxPublisher() as never,
      'evaluation',
      MODEL,
      20,
      false,
    );
  }

  test('an empty queue finishes the pass and releases nothing', async () => {
    const queue = createJobQueue([]);
    const service = build(queue);

    await service.processEvaluationJobs(5);

    expect(queue.releaseProcessing).toHaveBeenCalledTimes(1);
    expect(queue.claimNext).toHaveBeenCalledTimes(1);
    expect(queue.markDone).not.toHaveBeenCalled();
  });

  test('every pending job is claimed exactly once and marked done', async () => {
    const queue = createJobQueue([makeJob('1'), makeJob('2', 'business')]);
    const service = build(queue);
    (service as unknown as { evaluatePool: unknown }).evaluatePool = mock(async () => undefined);
    (service as unknown as { evaluateBusiness: unknown }).evaluateBusiness = mock(async () => undefined);

    await service.processEvaluationJobs(5);

    expect(queue.markDone.mock.calls.map(([id]: [unknown]) => String(id))).toEqual(['1', '2']);
    expect(queue.queue.every((job) => job.status === 'done')).toBe(true);
  });

  test('a pool job calls evaluatePool and a business job calls evaluateBusiness', async () => {
    const queue = createJobQueue([makeJob('1', 'pool'), makeJob('2', 'business')]);
    const service = build(queue);
    const evaluatePool = mock(async () => undefined);
    const evaluateBusiness = mock(async () => undefined);

    (service as unknown as { evaluatePool: unknown }).evaluatePool = evaluatePool;
    (service as unknown as { evaluateBusiness: unknown }).evaluateBusiness = evaluateBusiness;

    await service.processEvaluationJobs(5);

    expect(evaluatePool).toHaveBeenCalledWith({ poolId: 'pool-1', ownerId: 'owner-1', ownerType: 'business' });
    expect(evaluateBusiness).toHaveBeenCalledWith({
      businessId: 'business-2',
      ownerId: 'owner-1',
      ownerType: 'business',
    });
  });

  test('no more than `concurrency` jobs run at the same time', async () => {
    const queue = createJobQueue([makeJob('1'), makeJob('2'), makeJob('3'), makeJob('4')]);
    const service = build(queue);

    let running = 0;
    let maxRunning = 0;

    (service as unknown as { evaluatePool: unknown }).evaluatePool = mock(async () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, 10));
      running -= 1;
    });

    await service.processEvaluationJobs(2);

    expect(maxRunning).toBe(2);
    expect(queue.markDone).toHaveBeenCalledTimes(4);
  });

  test('a failing job burns all of its attempts inside one pass, the rest of the queue still runs', async () => {
    const queue = createJobQueue([makeJob('1'), makeJob('2')]);
    const service = build(queue);

    (service as unknown as { evaluatePool: unknown }).evaluatePool = mock(async (params: { poolId: string }) => {
      if (params.poolId === 'pool-1') throw new Error('rwa is down');
    });

    await service.processEvaluationJobs(1);

    // markAttemptFailed puts the job back to pending, so the same pass claims it
    // again immediately: all 3 attempts happen back to back, with no delay.
    expect(queue.markAttemptFailed).toHaveBeenCalledTimes(EVALUATION_JOB_MAX_ATTEMPTS);
    expect(queue.markDone).toHaveBeenCalledTimes(1);
    expect(queue.queue.find((job) => job._id.toString() === '1')!.status).toBe('failed');
    expect(queue.queue.find((job) => job._id.toString() === '2')!.status).toBe('done');
  });

  test('a job that keeps failing ends up failed after the attempt limit', async () => {
    const queue = createJobQueue([{ ...makeJob('1'), attempts: EVALUATION_JOB_MAX_ATTEMPTS - 1 }]);
    const service = build(queue);

    (service as unknown as { evaluatePool: unknown }).evaluatePool = mock(async () => {
      throw new Error('still down');
    });

    await service.processEvaluationJobs(1);

    expect(queue.queue[0].status).toBe('failed');
    expect(queue.markDone).not.toHaveBeenCalled();
  });

  test('a markAttemptFailed failure does not break the pass', async () => {
    const queue = createJobQueue([makeJob('1'), makeJob('2')]);
    const service = build(queue);

    queue.markAttemptFailed.mockImplementationOnce(async () => {
      throw new Error('mongo is down');
    });
    (service as unknown as { evaluatePool: unknown }).evaluatePool = mock(async (params: { poolId: string }) => {
      if (params.poolId === 'pool-1') throw new Error('rwa is down');
    });

    await service.processEvaluationJobs(1);

    expect(queue.markDone).toHaveBeenCalledTimes(1);
  });
});
