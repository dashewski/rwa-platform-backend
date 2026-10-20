/**
 * Unit tests for InboxConsumerMessageRepository (the dedup marker table).
 *
 * The repository is deliberately thin: it only inserts the marker and lets the
 * driver error through. The duplicate decision lives in InboxConsumerService:
 * a write error inside a transaction aborts it on the server, so it must not be
 * swallowed here. The transaction and the process-wide ALS switch also live in
 * the service, so nothing driver-level is needed in this file.
 */
import './setup';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import mongoose from 'mongoose';
import type { Model } from 'mongoose';
import { InboxConsumerMessageRepository } from '../src/repositories/inboxConsumerMessage.repository';

const MESSAGE_ID = '31337:0xabc:3';

/** Marker table with the unique messageId behaviour of the real index. */
function createFakeModel() {
  const state = {
    markers: new Set<string>(),
    createCalls: [] as Array<{ messageId: string }>,
    createError: null as unknown,
  };

  const model = {
    state,

    create: mock(async (data: { messageId: string }) => {
      state.createCalls.push(data);
      if (state.createError) throw state.createError;

      if (state.markers.has(data.messageId)) {
        throw Object.assign(
          new Error('E11000 duplicate key error collection: inboxconsumermessages index: messageId_1'),
          { code: 11000 },
        );
      }

      state.markers.add(data.messageId);
      return { toObject: () => ({ ...data }) };
    }),
  };

  return model;
}

type FakeModel = ReturnType<typeof createFakeModel>;

function repoWith(model: FakeModel): InboxConsumerMessageRepository {
  return new InboxConsumerMessageRepository(
    model as unknown as ConstructorParameters<typeof InboxConsumerMessageRepository>[0],
  );
}

describe('InboxConsumerMessageRepository (unit, fake model)', () => {
  let model: FakeModel;
  let repository: InboxConsumerMessageRepository;

  beforeEach(() => {
    model = createFakeModel();
    repository = repoWith(model);
  });

  test('the first insert writes the marker and resolves', async () => {
    const created = await repository.create(MESSAGE_ID);

    expect(created).toBeUndefined();
    expect(model.state.createCalls).toEqual([{ messageId: MESSAGE_ID }]);
    expect(model.state.markers.has(MESSAGE_ID)).toBe(true);
  });

  test('a duplicate key error (code 11000) is rethrown, not turned into a boolean', async () => {
    await repository.create(MESSAGE_ID);

    const failure = await repository.create(MESSAGE_ID).catch((error: { code?: number }) => error);

    expect((failure as { code?: number }).code).toBe(11000);
    expect(model.state.createCalls).toHaveLength(2);
  });

  test('a duplicate key error is rethrown even when the code sits deeper in a cause chain', async () => {
    const wrapped = new Error('write failed', {
      cause: Object.assign(new Error('E11000 duplicate key'), { code: 11000 }),
    });
    model.state.createError = wrapped;

    await expect(repository.create(MESSAGE_ID)).rejects.toThrow('write failed');
  });

  test('a storage error that is not a duplicate key is rethrown', async () => {
    model.state.createError = new Error('MongoServerSelectionError: server selection timed out');

    await expect(repository.create(MESSAGE_ID)).rejects.toThrow('server selection timed out');
  });

  test('the repository does not open transactions itself', async () => {
    const transaction = mock(async (fn: () => Promise<void>) => {
      await fn();
    });
    const original = (mongoose.connection as unknown as { transaction: unknown }).transaction;
    (mongoose.connection as unknown as { transaction: unknown }).transaction = transaction;

    try {
      await repository.create(MESSAGE_ID);
    } finally {
      (mongoose.connection as unknown as { transaction: unknown }).transaction = original;
    }

    expect(transaction).not.toHaveBeenCalled();
  });

  test('the repository does not switch mongoose to transactionAsyncLocalStorage (the service does)', () => {
    const sets: unknown[][] = [];
    const originalSet = mongoose.set;
    (mongoose as unknown as { set: unknown }).set = (...args: unknown[]) => {
      sets.push(args);
      return mongoose;
    };

    try {
      repoWith(createFakeModel());
    } finally {
      (mongoose as unknown as { set: unknown }).set = originalSet;
    }

    expect(sets).toEqual([]);
  });

  test('a transaction-level failure from the caller is not swallowed by the marker insert', async () => {
    model.state.createError = new Error('Transaction numbers are only allowed on a replica set member or mongos');

    await expect(repository.create(MESSAGE_ID)).rejects.toThrow(
      'Transaction numbers are only allowed on a replica set member or mongos',
    );
  });
});
