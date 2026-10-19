/**
 * Unit tests for OutboxPublisherMessageRepository.
 *
 * The repository is the only place that touches Mongo, so the model is a fake
 * and the assertions are about the queries and update pipelines it builds.
 */
import './setup';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import { OutboxPublisherMessageRepository } from '../src/repositories/outboxPublisherMessage.repository';

const EXCHANGE = 'blockchain.events';
const OTHER_EXCHANGE = 'evaluation';

function createFakeModel() {
  const state = {
    createCalls: [] as unknown[],
    createError: null as unknown,
    claimCalls: [] as Array<{ filter: unknown; update: unknown; options: unknown }>,
    claimResult: null as unknown,
    claimError: null as unknown,
    markSentCalls: [] as Array<{ filter: unknown; update: unknown }>,
    markAttemptCalls: [] as Array<{ filter: unknown; update: unknown; options: unknown }>,
    markAttemptResult: null as unknown,
    releaseCalls: [] as Array<{ filter: unknown; update: unknown }>,
  };

  const model = {
    state,

    create: mock(async (data: unknown) => {
      state.createCalls.push(data);
      if (state.createError) throw state.createError;
      return { toObject: () => ({ ...(data as object) }) };
    }),

    findOneAndUpdate: mock((filter: unknown, update: unknown, options?: unknown) => {
      const isClaim = Array.isArray(update) === false;
      (isClaim ? state.claimCalls : state.markAttemptCalls).push({ filter, update, options });

      const result = isClaim ? state.claimResult : state.markAttemptResult;
      const error = isClaim ? state.claimError : null;

      return {
        lean: async () => {
          if (error) throw error;
          return result;
        },
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
          if (error) return Promise.reject(error).then(resolve, reject);
          return Promise.resolve(result).then(resolve, reject);
        },
      };
    }),

    updateOne: mock(async (filter: unknown, update: unknown) => {
      state.markSentCalls.push({ filter, update });
    }),

    updateMany: mock(async (filter: unknown, update: unknown) => {
      state.releaseCalls.push({ filter, update });
    }),
  };

  return model;
}

type FakeModel = ReturnType<typeof createFakeModel>;

function repoWith(model: FakeModel): OutboxPublisherMessageRepository {
  return new OutboxPublisherMessageRepository(model as unknown as Model<unknown>);
}

describe('OutboxPublisherMessageRepository (unit, fake model)', () => {
  let model: FakeModel;
  let repository: OutboxPublisherMessageRepository;

  beforeEach(() => {
    model = createFakeModel();
    repository = repoWith(model);
  });

  describe('create', () => {
    test('returns the created document as a plain object', async () => {
      const created = await repository.create({
        exchange: EXCHANGE,
        routingKey: 'Governance_VoteCast',
        payload: { a: 1 },
        messageId: 'message-1',
      });

      expect(created).toMatchObject({ exchange: EXCHANGE, messageId: 'message-1' });
      expect(model.state.createCalls).toHaveLength(1);
    });

    test('returns null for a duplicate messageId (code 11000)', async () => {
      model.state.createError = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });

      const created = await repository.create({
        exchange: EXCHANGE,
        routingKey: 'x',
        payload: {},
        messageId: 'message-1',
      });

      expect(created).toBeNull();
    });

    test('a duplicate code wrapped into a cause chain is not treated as a duplicate', async () => {
      model.state.createError = new Error('write failed', {
        cause: Object.assign(new Error('E11000 duplicate key'), { code: 11000 }),
      });

      await expect(
        repository.create({ exchange: EXCHANGE, routingKey: 'x', payload: {}, messageId: 'message-1' }),
      ).rejects.toThrow('write failed');
    });

    test('any other storage error is rethrown', async () => {
      model.state.createError = new Error('MongoServerSelectionError: server selection timed out');

      await expect(
        repository.create({ exchange: EXCHANGE, routingKey: 'x', payload: {}, messageId: 'message-1' }),
      ).rejects.toThrow('server selection timed out');
    });
  });

  describe('claimNext', () => {
    test('claims the oldest pending row of the exchange and marks it sending', async () => {
      model.state.claimResult = { _id: 'row-1', status: 'sending' };

      const claimed = await repository.claimNext(EXCHANGE);

      expect(claimed).toEqual({ _id: 'row-1', status: 'sending' });
      expect(model.state.claimCalls).toHaveLength(1);

      const call = model.state.claimCalls[0];
      expect(call.filter).toEqual({ status: 'pending', exchange: EXCHANGE });
      expect(call.update).toEqual({ $set: { status: 'sending' } });
      expect(call.options).toEqual({ sort: { _id: 1 }, new: true });
    });

    test('returns null when nothing is pending', async () => {
      model.state.claimResult = null;

      expect(await repository.claimNext(EXCHANGE)).toBeNull();
    });

    test('a claim failure is propagated to the caller', async () => {
      model.state.claimError = new Error('MongoServerSelectionError: server selection timed out');

      await expect(repository.claimNext(EXCHANGE)).rejects.toThrow('server selection timed out');
    });

    test('another exchange never claims rows of the first one', async () => {
      await repository.claimNext(OTHER_EXCHANGE);

      expect(model.state.claimCalls[0].filter).toEqual({ status: 'pending', exchange: OTHER_EXCHANGE });
    });
  });

  describe('markSent', () => {
    test('marks the row sent, stamps sentAt and schedules the 30-day TTL', async () => {
      const id = new Types.ObjectId();
      const before = Math.floor(Date.now() / 1000);

      await repository.markSent(id);

      const { filter, update } = model.state.markSentCalls[0] as {
        filter: { _id: Types.ObjectId };
        update: { $set: { status: string; sentAt: number; expiresAt: Date } };
      };
      expect(filter).toEqual({ _id: id });
      expect(update.$set.status).toBe('sent');
      expect(update.$set.sentAt).toBeGreaterThanOrEqual(before);
      expect(update.$set.expiresAt).toBeInstanceOf(Date);

      const ttlDays = (update.$set.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      expect(ttlDays).toBeGreaterThan(29.9);
      expect(ttlDays).toBeLessThan(30.1);
    });
  });

  describe('markAttemptFailed', () => {
    test('increments the attempts counter and keeps the row sending while the limit is not reached', async () => {
      const id = new Types.ObjectId();
      model.state.markAttemptResult = { _id: id, attempts: 2, status: 'sending' };

      const updated = await repository.markAttemptFailed(id, 5);

      expect(updated).toEqual({ _id: id, attempts: 2, status: 'sending' });
      const call = model.state.markAttemptCalls[0];
      expect(call.filter).toEqual({ _id: id });
      expect(call.update).toEqual([
        { $set: { attempts: { $add: ['$attempts', 1] } } },
        { $set: { status: { $cond: [{ $gte: ['$attempts', 5] }, 'failed', 'sending'] } } },
      ]);
      expect(call.options).toEqual({ new: true });
    });

    test('the pipeline flips the row to failed once attempts reach maxAttempts', async () => {
      const id = new Types.ObjectId();
      model.state.markAttemptResult = { _id: id, attempts: 5, status: 'failed' };

      const updated = await repository.markAttemptFailed(id, 5);

      expect(updated?.status).toBe('failed');
      expect((model.state.markAttemptCalls[0].update as unknown[])[1]).toEqual({
        $set: { status: { $cond: [{ $gte: ['$attempts', 5] }, 'failed', 'sending'] } },
      });
    });

    test('maxAttempts = Infinity never flips the row to failed', async () => {
      const id = new Types.ObjectId();
      model.state.markAttemptResult = { _id: id, attempts: 1000, status: 'sending' };

      await repository.markAttemptFailed(id, Number.POSITIVE_INFINITY);

      const pipeline = model.state.markAttemptCalls[0].update as Array<{ $set: Record<string, unknown> }>;
      expect(pipeline[1].$set.status).toEqual({
        $cond: [{ $gte: ['$attempts', Number.POSITIVE_INFINITY] }, 'failed', 'sending'],
      });
      expect((model.state.markAttemptResult as { status: string }).status).toBe('sending');
    });

    test('a missing row yields null (the caller treats it as "nothing to fail")', async () => {
      model.state.markAttemptResult = null;

      expect(await repository.markAttemptFailed(new Types.ObjectId(), 3)).toBeNull();
    });
  });

  describe('releaseSending', () => {
    test('returns every sending row of the exchange to pending', async () => {
      await repository.releaseSending(EXCHANGE);

      expect(model.state.releaseCalls).toEqual([
        { filter: { status: 'sending', exchange: EXCHANGE }, update: { $set: { status: 'pending' } } },
      ]);
    });

    test('does not touch rows of other exchanges', async () => {
      await repository.releaseSending(OTHER_EXCHANGE);

      expect(model.state.releaseCalls[0].filter).toEqual({ status: 'sending', exchange: OTHER_EXCHANGE });
    });

    test('a failure is propagated (a broken pass must be visible)', async () => {
      model.updateMany = mock(async () => {
        throw new Error('write concern failed');
      }) as unknown as FakeModel['updateMany'];
      const broken = repoWith(model);

      await expect(broken.releaseSending(EXCHANGE)).rejects.toThrow('write concern failed');
    });
  });
});
