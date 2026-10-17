import { describe, expect, it } from 'bun:test';
import { mock } from 'bun:test';
import mongoose from 'mongoose';
import { ProcessedMessageRepository } from '../src/repositories/processedMessage.repository';

type ProcessedModel = ConstructorParameters<typeof ProcessedMessageRepository>[0];

describe('ProcessedMessageRepository', () => {
  // The real runOnce() wraps everything in a Mongo transaction; the marker +
  // handler branches are tested with the transaction replaced by a pass-through.
  const originalTransaction = mongoose.connection.transaction;

  const withInlineTransaction = <T>(run: () => Promise<T>) => async () => {
    (mongoose.connection as unknown as { transaction: (fn: () => Promise<unknown>) => Promise<unknown> }).transaction =
      async (fn) => await fn();

    try {
      await run();
    } finally {
      (mongoose.connection as unknown as { transaction: typeof originalTransaction }).transaction = originalTransaction;
    }
  };

  it(
    'runs the handler once and records the marker',
    withInlineTransaction(async () => {
      const model = { create: mock(async (_data: Record<string, unknown>) => ({})), exists: mock(async () => null) };
      const repository = new ProcessedMessageRepository(model as unknown as ProcessedModel);
      const handler = mock(async () => {});

      const applied = await repository.runOnce('orders.stream:msg-1', handler);

      expect(applied).toBe(true);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(model.create).toHaveBeenCalledWith({ key: 'orders.stream:msg-1' });
    }),
  );

  it(
    'skips a re-delivery when the marker already exists',
    withInlineTransaction(async () => {
      const duplicate = Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
      const model = {
        create: mock(async (_data: Record<string, unknown>) => {
          throw duplicate;
        }),
        exists: mock(async (_filter: Record<string, unknown>) => ({ _id: 'marker-1' })),
      };
      const repository = new ProcessedMessageRepository(model as unknown as ProcessedModel);
      const handler = mock(async () => {});

      const applied = await repository.runOnce('orders.stream:msg-1', handler);

      expect(applied).toBe(false);
      expect(handler).not.toHaveBeenCalled();
      expect(model.exists).toHaveBeenCalledWith({ key: 'orders.stream:msg-1' });
    }),
  );

  it(
    'rethrows a duplicate-key error that did not come from the marker',
    withInlineTransaction(async () => {
      // The handler's own unique index fired: after the rollback there is no
      // marker, so the retry loop must see the error, not a silent "already applied".
      const duplicate = Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
      const model = { create: mock(async (_data: Record<string, unknown>) => ({})), exists: mock(async () => null) };
      const repository = new ProcessedMessageRepository(model as unknown as ProcessedModel);
      const handler = mock(async () => {
        throw duplicate;
      });

      await expect(repository.runOnce('orders.stream:msg-1', handler)).rejects.toThrow('E11000');
      expect(model.exists).toHaveBeenCalledTimes(1);
    }),
  );

  it(
    'propagates a non-duplicate handler error without touching the marker',
    withInlineTransaction(async () => {
      const model = { create: mock(async (_data: Record<string, unknown>) => ({})), exists: mock(async () => null) };
      const repository = new ProcessedMessageRepository(model as unknown as ProcessedModel);
      const handler = mock(async () => {
        throw new Error('mongo write failed');
      });

      await expect(repository.runOnce('orders.stream:msg-1', handler)).rejects.toThrow('mongo write failed');
      expect(model.exists).not.toHaveBeenCalled();
    }),
  );
});
