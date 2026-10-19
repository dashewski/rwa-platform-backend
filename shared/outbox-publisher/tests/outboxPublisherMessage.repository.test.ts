/**
 * Unit tests for OutboxPublisherMessageRepository.
 *
 * The Mongoose model is replaced with an in-memory stub (the repository takes
 * it as a constructor argument), so these tests need no database. What is
 * pinned down here: the exact queries the repository sends (filters, updates,
 * sort) and how it reacts to the duplicate-key error raised by the unique
 * `{ exchange, messageId }` index.
 */
import './setup';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { Types } from 'mongoose';
import { OutboxPublisherMessageRepository } from '../src/repositories/outboxPublisherMessage.repository';
import { EXCHANGE } from './fakes';

const MESSAGE_ID = '31337:0xabc:3';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

type Doc = {
  _id: Types.ObjectId;
  exchange: string;
  routingKey: string;
  payload: unknown;
  messageId: string;
  status: 'pending' | 'sending' | 'sent';
  sentAt?: number | null;
  expiresAt?: Date | null;
};

/** Records every call and returns scripted results. */
function createFakeModel() {
  const calls = {
    create: [] as unknown[],
    findOneAndUpdate: [] as Array<{ filter: unknown; update: unknown; options: unknown }>,
    updateOne: [] as Array<{ filter: unknown; update: unknown }>,
    updateMany: [] as Array<{ filter: unknown; update: unknown }>,
  };

  const state = {
    createResult: null as Doc | null,
    createError: null as unknown,
    claimResult: null as Doc | null,
    claimError: null as unknown,
    updateOneError: null as unknown,
    updateManyError: null as unknown,
  };

  const model = {
    calls,
    state,

    create: mock(async (data: Partial<Doc>) => {
      calls.create.push(data);
      if (state.createError) throw state.createError;
      return {
        toObject: () => ({ _id: new Types.ObjectId(), createdAt: 1, updatedAt: 1, ...data }),
      };
    }),

    findOneAndUpdate: mock((filter: unknown, update: unknown, options: unknown) => {
      calls.findOneAndUpdate.push({ filter, update, options });
      return {
        lean: async () => {
          if (state.claimError) throw state.claimError;
          return state.claimResult;
        },
      };
    }),

    updateOne: mock(async (filter: unknown, update: unknown) => {
      calls.updateOne.push({ filter, update });
      if (state.updateOneError) throw state.updateOneError;
      return { acknowledged: true };
    }),

    updateMany: mock(async (filter: unknown, update: unknown) => {
      calls.updateMany.push({ filter, update });
      if (state.updateManyError) throw state.updateManyError;
      return { acknowledged: true };
    }),
  };

  return model;
}

type FakeModel = ReturnType<typeof createFakeModel>;

function repoWith(model: FakeModel): OutboxPublisherMessageRepository {
  return new OutboxPublisherMessageRepository(model as never);
}

function duplicateKeyError(): Error {
  return new Error('E11000 duplicate key error collection: outboxpublishermessages index: exchange_1_messageId_1') as Error & {
    code?: number;
  };
}

describe('OutboxPublisherMessageRepository (unit, fake model)', () => {
  let model: FakeModel;
  let repository: OutboxPublisherMessageRepository;

  beforeEach(() => {
    model = createFakeModel();
    repository = repoWith(model);
  });

  describe('create', () => {
    test('inserts the row as-is and returns the plain document', async () => {
      const created = await repository.create({
        exchange: EXCHANGE,
        routingKey: 'Governance_VoteCast',
        payload: { a: 1 },
        messageId: MESSAGE_ID,
      });

      expect(model.calls.create).toEqual([
        { exchange: EXCHANGE, routingKey: 'Governance_VoteCast', payload: { a: 1 }, messageId: MESSAGE_ID },
      ]);
      expect(created).toMatchObject({
        exchange: EXCHANGE,
        routingKey: 'Governance_VoteCast',
        payload: { a: 1 },
        messageId: MESSAGE_ID,
      });
    });

    test('returns null when the unique { exchange, messageId } index rejects the duplicate', async () => {
      const duplicate = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
      model.state.createError = duplicate;

      const created = await repository.create({
        exchange: EXCHANGE,
        routingKey: 'Governance_VoteCast',
        payload: {},
        messageId: MESSAGE_ID,
      });

      // A rescan of the same block queues the same event: not an error, just nothing new.
      expect(created).toBeNull();
    });

    test('returns null when the duplicate code sits deeper in the cause chain', async () => {
      const mongo = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
      const wrapped = new Error('MongooseServerError: write failed', { cause: mongo });
      model.state.createError = wrapped;

      const created = await repository.create({
        exchange: EXCHANGE,
        routingKey: 'Governance_VoteCast',
        payload: {},
        messageId: MESSAGE_ID,
      });

      expect(created).toBeNull();
    });

    test('rethrows any other failure (validation, connection loss)', async () => {
      const network = new Error('connection 127.0.0.1:27017 closed');
      model.state.createError = network;

      await expect(
        repository.create({ exchange: EXCHANGE, routingKey: 'r', payload: {}, messageId: MESSAGE_ID }),
      ).rejects.toThrow('connection 127.0.0.1:27017 closed');
    });
  });

  describe('claimNext', () => {
    test('atomically flips the oldest pending row of the exchange to sending', async () => {
      const doc = {
        _id: new Types.ObjectId(),
        exchange: EXCHANGE,
        routingKey: 'Governance_VoteCast',
        payload: { proposalId: '1' },
        messageId: MESSAGE_ID,
        status: 'sending' as const,
      };
      model.state.claimResult = doc;

      const claimed = await repository.claimNext(EXCHANGE);

      expect(claimed).toBe(doc);
      expect(model.calls.findOneAndUpdate).toEqual([
        {
          filter: { status: 'pending', exchange: EXCHANGE },
          update: { $set: { status: 'sending' } },
          options: { sort: { _id: 1 }, new: true },
        },
      ]);
    });

    test('returns null when the exchange has no pending rows left', async () => {
      model.state.claimResult = null;

      expect(await repository.claimNext(EXCHANGE)).toBeNull();
      expect(model.calls.findOneAndUpdate).toHaveLength(1);
    });

    test('propagates a database failure to the caller (the pass decides what to do)', async () => {
      model.state.claimError = new Error('MongoServerSelectionError: server selection timed out');

      await expect(repository.claimNext(EXCHANGE)).rejects.toThrow('server selection timed out');
    });

    test('scopes the claim to the requested exchange only', async () => {
      await repository.claimNext('other.events');

      expect(model.calls.findOneAndUpdate[0].filter).toEqual({ status: 'pending', exchange: 'other.events' });
    });
  });

  describe('markSent', () => {
    test('stamps status, sentAt (seconds) and the retention deadline', async () => {
      const id = new Types.ObjectId();
      const before = Date.now();

      await repository.markSent(id);

      expect(model.calls.updateOne).toHaveLength(1);
      const { filter, update } = model.calls.updateOne[0] as {
        filter: { _id: Types.ObjectId };
        update: { $set: { status: string; sentAt: number; expiresAt: Date } };
      };

      expect(filter).toEqual({ _id: id });
      expect(update.$set.status).toBe('sent');
      expect(update.$set.sentAt).toBe(Math.floor(before / 1000));
      expect(update.$set.expiresAt).toBeInstanceOf(Date);
      // TTL of 30 days: the row disappears ~30 days after it was sent.
      expect(update.$set.expiresAt.getTime()).toBeGreaterThanOrEqual(before + TTL_MS - 1000);
      expect(update.$set.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + TTL_MS + 1000);
    });

    test('accepts a string id (the service passes the id from the claimed document)', async () => {
      const id = new Types.ObjectId().toString();

      await repository.markSent(id);

      expect((model.calls.updateOne[0] as { filter: unknown }).filter).toEqual({ _id: id });
    });

    test('propagates the failure so the caller can release the row', async () => {
      model.state.updateOneError = new Error('connection reset by peer');

      await expect(repository.markSent(new Types.ObjectId())).rejects.toThrow('connection reset by peer');
    });
  });

  describe('release', () => {
    test('returns a single row to pending without touching anything else', async () => {
      const id = new Types.ObjectId();

      await repository.release(id);

      expect(model.calls.updateOne).toEqual([{ filter: { _id: id }, update: { $set: { status: 'pending' } } }]);
    });

    test('propagates the failure (the caller decides, and swallows it on purpose)', async () => {
      model.state.updateOneError = new Error('write concern failed');

      await expect(repository.release(new Types.ObjectId())).rejects.toThrow('write concern failed');
    });
  });

  describe('releaseSending', () => {
    test('returns every sending row of the exchange to pending', async () => {
      await repository.releaseSending(EXCHANGE);

      expect(model.calls.updateMany).toEqual([
        {
          filter: { status: 'sending', exchange: EXCHANGE },
          update: { $set: { status: 'pending' } },
        },
      ]);
    });

    test('does not touch rows of other exchanges', async () => {
      await repository.releaseSending('other.events');

      expect((model.calls.updateMany[0] as { filter: unknown }).filter).toEqual({
        status: 'sending',
        exchange: 'other.events',
      });
    });

    test('propagates the failure (a broken pass must be visible)', async () => {
      model.state.updateManyError = new Error('primary stepped down');

      await expect(repository.releaseSending(EXCHANGE)).rejects.toThrow('primary stepped down');
    });
  });
});
