/**
 * Unit tests for InboxConsumerMessageRepository (the dedup inbox).
 *
 * The repository owns the exactly-once guarantee of the consumer: the marker
 * row and the handler must run in one transaction, and a duplicate key means
 * "already processed". Mongoose is used unconnected here — the transaction
 * wrapper is replaced with a driver-level stub on the connection instance and
 * the model is injected, so no database is needed.
 */
import './setup';
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import mongoose from 'mongoose';
import type { Model } from 'mongoose';
import { InboxConsumerMessageRepository } from '../src/repositories/inboxConsumerMessage.repository';

const MESSAGE_ID = '31337:0xabc:3';

type TransactionFn = () => Promise<void>;

/** Driver-level stub: runs the callback directly (no replica set needed). */
function stubTransaction() {
  const calls: Array<{ startedAt: number; finishedAt: number }> = [];
  const state = {
    calls,
    error: null as unknown,
    beforeRun: null as null | (() => Promise<void> | void),
  };

  (mongoose.connection as unknown as { transaction: (fn: TransactionFn) => Promise<void> }).transaction = async (
    fn: TransactionFn,
  ) => {
    const record = { startedAt: Date.now(), finishedAt: 0 };
    calls.push(record);

    if (state.beforeRun) await state.beforeRun();
    if (state.error) throw state.error;

    await fn();
    record.finishedAt = Date.now();
  };

  return state;
}

/** Marker table with the unique messageId behaviour of the real index. */
function createFakeModel() {
  const state = {
    markers: new Set<string>(),
    createCalls: [] as Array<{ messageId: string }>,
    existsCalls: [] as string[],
    createError: null as unknown,
  };

  const model = {
    state,

    create: mock(async (data: { messageId: string }) => {
      state.createCalls.push(data);
      if (state.createError) throw state.createError;

      if (state.markers.has(data.messageId)) {
        throw Object.assign(
          new Error(`E11000 duplicate key error collection: inboxconsumermessages index: messageId_1`),
          { code: 11000 },
        );
      }

      state.markers.add(data.messageId);
      return { toObject: () => ({ ...data }) };
    }),

    exists: mock(async (filter: { messageId: string }) => {
      state.existsCalls.push(filter.messageId);
      return state.markers.has(filter.messageId) ? { _id: 'marker' } : null;
    }),
  };

  return model;
}

type FakeModel = ReturnType<typeof createFakeModel>;

function repoWith(model: FakeModel): InboxConsumerMessageRepository {
  return new InboxConsumerMessageRepository(model as unknown as Model<unknown>);
}

describe('InboxConsumerMessageRepository (unit, stubbed transaction + fake model)', () => {
  let transaction: ReturnType<typeof stubTransaction>;
  let model: FakeModel;
  let repository: InboxConsumerMessageRepository;
  let setSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    transaction = stubTransaction();
    model = createFakeModel();
    setSpy = spyOn(mongoose, 'set').mockImplementation((() => mongoose) as typeof mongoose.set);
    repository = repoWith(model);
  });

  afterEach(() => {
    setSpy.mockRestore();
  });

  test('runs the marker insert and the handler inside one transaction and reports "applied"', async () => {
    const events: string[] = [];
    transaction.calls.length = 0;
    const originalCreate = model.create.getMockImplementation()!;
    model.create.mockImplementation(async (data: { messageId: string }) => {
      events.push('create');
      return originalCreate(data);
    });

    const applied = await repository.runOnce(MESSAGE_ID, async () => {
      events.push('handler');
    });

    expect(applied).toBe(true);
    expect(events).toEqual(['create', 'handler']);
    expect(transaction.calls).toHaveLength(1);
    expect(model.state.createCalls).toEqual([{ messageId: MESSAGE_ID }]);
  });

  test('the marker is inserted before the handler (a crash between them rolls both back)', async () => {
    const order: string[] = [];
    const originalCreate = model.create.getMockImplementation()!;
    model.create.mockImplementation(async (data: { messageId: string }) => {
      order.push('marker');
      return originalCreate(data);
    });

    await repository.runOnce(MESSAGE_ID, async () => {
      order.push('handler');
    });

    expect(order).toEqual(['marker', 'handler']);
  });

  test('a handler failure propagates (the transaction is aborted, nothing is marked as processed)', async () => {
    await expect(
      repository.runOnce(MESSAGE_ID, async () => {
        throw new Error('db write failed inside the handler');
      }),
    ).rejects.toThrow('db write failed inside the handler');

    // The duplicate check is not consulted: this is not a duplicate, it is a failure.
    expect(model.state.existsCalls).toEqual([]);
    expect(transaction.calls).toHaveLength(1);
  });

  test('a second delivery of the same messageId is a no-op and reports "duplicate"', async () => {
    await repository.runOnce(MESSAGE_ID, async () => undefined);

    let handlerRuns = 0;
    const applied = await repository.runOnce(MESSAGE_ID, async () => {
      handlerRuns += 1;
    });

    expect(applied).toBe(false);
    expect(handlerRuns).toBe(0);
    expect(model.state.existsCalls).toEqual([MESSAGE_ID]);
    expect(transaction.calls).toHaveLength(2);
  });

  test('the duplicate is detected when the key error sits deeper in the cause chain', async () => {
    model.state.markers.add(MESSAGE_ID);
    const duplicate = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    model.state.createError = new Error('write failed', { cause: duplicate });

    const applied = await repository.runOnce(MESSAGE_ID, async () => undefined);

    expect(applied).toBe(false);
    expect(model.state.existsCalls).toEqual([MESSAGE_ID]);
  });

  test('an error whose chain carries no duplicate code is rethrown even when the marker exists', async () => {
    model.state.markers.add(MESSAGE_ID);
    model.state.createError = new Error('WriteConflict during write');

    await expect(repository.runOnce(MESSAGE_ID, async () => undefined)).rejects.toThrow('WriteConflict during write');
    expect(model.state.existsCalls).toEqual([]);
  });

  test('a duplicate code with no marker row present is rethrown (a rollback race must be visible)', async () => {
    model.state.createError = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    // markers stays empty: the row this error talks about is gone.

    await expect(repository.runOnce(MESSAGE_ID, async () => undefined)).rejects.toThrow('E11000 duplicate key');
    expect(model.state.existsCalls).toEqual([MESSAGE_ID]);
  });

  test('a non-duplicate storage error is rethrown without touching the marker table', async () => {
    model.state.createError = new Error('MongoServerSelectionError: server selection timed out');

    await expect(repository.runOnce(MESSAGE_ID, async () => undefined)).rejects.toThrow('server selection timed out');
    expect(model.state.existsCalls).toEqual([]);
  });

  test('a transaction-level failure (replica set unavailable) is rethrown as-is', async () => {
    transaction.error = new Error('Transaction numbers are only allowed on a replica set member or mongos');

    await expect(repository.runOnce(MESSAGE_ID, async () => undefined)).rejects.toThrow(
      'Transaction numbers are only allowed on a replica set member or mongos',
    );
    expect(model.state.createCalls).toEqual([]);
  });

  test('every delivery gets its own transaction', async () => {
    await repository.runOnce('id-1', async () => undefined);
    await repository.runOnce('id-2', async () => undefined);
    await repository.runOnce('id-1', async () => undefined);

    expect(transaction.calls).toHaveLength(3);
    expect(model.state.createCalls.map((call) => call.messageId)).toEqual(['id-1', 'id-2', 'id-1']);
  });

  test('constructing the repository switches mongoose to transactionAsyncLocalStorage (process-wide)', () => {
    setSpy.mockClear();

    repoWith(createFakeModel());

    expect(setSpy).toHaveBeenCalledWith('transactionAsyncLocalStorage', true);
  });
});
