/**
 * Unit tests for EvaluationJobRepository — the durable job queue behind
 * POST /createPoolEvaluation and /createBusinessEvaluation.
 *
 * The model is a fake: assertions are about the queries and the update
 * pipeline, not about Mongo.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { EvaluationJobRepository } from '../src/repositories/evaluationJob.repository';

type FakeModel = {
  create: ReturnType<typeof mock>;
  updateMany: ReturnType<typeof mock>;
  updateOne: ReturnType<typeof mock>;
  findOneAndUpdate: ReturnType<typeof mock>;
};

function createFakeModel(): FakeModel {
  return {
    create: mock(async (doc: Record<string, unknown>) => ({ _id: 'job-1', ...doc })),
    updateMany: mock(async () => ({ modifiedCount: 0 })),
    updateOne: mock(async () => ({ modifiedCount: 1 })),
    findOneAndUpdate: mock(() => {
      const result = { _id: 'job-1', status: 'processing', attempts: 0 };

      return { lean: async () => result };
    }),
  };
}

describe('EvaluationJobRepository', () => {
  let model: FakeModel;
  let repository: EvaluationJobRepository;

  beforeEach(() => {
    model = createFakeModel();
    repository = new EvaluationJobRepository(model as never);
  });

  test('create: stores the job as pending with zero attempts', async () => {
    const job = (await repository.create({
      entityType: 'pool',
      entityId: 'pool-1',
      params: { poolId: 'pool-1', ownerId: 'owner-1', ownerType: 'business' },
    })) as unknown as { _id: unknown };

    expect(model.create).toHaveBeenCalledWith({
      entityType: 'pool',
      entityId: 'pool-1',
      params: { poolId: 'pool-1', ownerId: 'owner-1', ownerType: 'business' },
      status: 'pending',
      attempts: 0,
    });
    expect(String(job._id)).toBe('job-1');
  });

  test('create: keeps the params payload untouched', async () => {
    const params = { businessId: 'business-1', ownerId: 'owner-1', ownerType: 'business' };

    await repository.create({ entityType: 'business', entityId: 'business-1', params });

    expect((model.create.mock.calls[0][0] as { params: unknown }).params).toBe(params);
  });

  test('releaseProcessing: returns abandoned jobs to pending', async () => {
    await repository.releaseProcessing();

    expect(model.updateMany).toHaveBeenCalledWith({ status: 'processing' }, { status: 'pending' });
  });

  test('claimNext: takes the oldest pending job and marks it processing', async () => {
    await repository.claimNext();

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { status: 'pending' },
      { status: 'processing' },
      { sort: { _id: 1 }, new: true },
    );
  });

  test('claimNext: returns a plain object, not a mongoose document', async () => {
    const job = (await repository.claimNext()) as unknown;

    expect(job).toEqual({ _id: 'job-1', status: 'processing', attempts: 0 });
  });

  test('markDone: only flips the status', async () => {
    await repository.markDone('job-1');

    expect(model.updateOne).toHaveBeenCalledWith({ _id: 'job-1' }, { status: 'done' });
  });

  test('markAttemptFailed: increments attempts and settles the status in one pipeline', async () => {
    await repository.markAttemptFailed('job-1', 3);

    const [filter, pipeline, options] = model.findOneAndUpdate.mock.calls[0];

    expect(filter).toEqual({ _id: 'job-1' });
    expect(options).toEqual({ new: true });

    // The pipeline is two stages on purpose: the second one sees the attempts
    // value already incremented by the first.
    expect(pipeline).toEqual([
      { $set: { attempts: { $add: ['$attempts', 1] } } },
      { $set: { status: { $cond: [{ $gte: ['$attempts', 3] }, 'failed', 'pending'] } } },
    ]);
  });

  test('markAttemptFailed: returns the updated job for the caller to inspect', async () => {
    const job = (await repository.markAttemptFailed('job-1', 3)) as unknown;

    expect(job).toEqual({ _id: 'job-1', status: 'processing', attempts: 0 });
  });
});
