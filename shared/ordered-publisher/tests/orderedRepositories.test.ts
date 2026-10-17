import { describe, expect, it } from 'bun:test';
import { mock } from 'bun:test';
import { OutboxMessageRepository } from '../src/repositories/outboxMessage.repository';

type OutboxModel = ConstructorParameters<typeof OutboxMessageRepository>[0];

function createFakeOutboxModel() {
  return {
    create: mock(async (data: Record<string, unknown>) => ({
      toObject: () => ({ _id: 'outbox-1', ...data }),
    })),

    findOneAndUpdate: mock((_filter: unknown, _update: unknown, _options: unknown) => ({
      lean: async () => ({ _id: 'outbox-1', routingKey: 'order.created', payload: { seq: 1 }, messageId: 'chain-1' }),
    })),

    updateOne: mock(async (_filter: unknown, _update: unknown) => ({ matchedCount: 1 })),

    updateMany: mock(async (_filter: unknown, _update: unknown) => ({ modifiedCount: 1 })),
  };
}

describe('OutboxMessageRepository', () => {
  it('records a message and returns the raw document', async () => {
    const model = createFakeOutboxModel();
    const repository = new OutboxMessageRepository(model as unknown as OutboxModel);

    const doc = await repository.create({ routingKey: 'order.created', payload: { seq: 1 }, messageId: 'chain-1' });

    expect(model.create).toHaveBeenCalledWith({ routingKey: 'order.created', payload: { seq: 1 }, messageId: 'chain-1' });
    expect(doc as unknown).toEqual({
      _id: 'outbox-1',
      routingKey: 'order.created',
      payload: { seq: 1 },
      messageId: 'chain-1',
    });
  });

  it('claims the oldest pending message only', async () => {
    const model = createFakeOutboxModel();
    const repository = new OutboxMessageRepository(model as unknown as OutboxModel);

    const claimed = await repository.claimNext();

    const [filter, update, options] = model.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ status: 'pending' });
    expect(update).toEqual({ $set: { status: 'sending' } });
    expect(options).toEqual({ sort: { _id: 1 }, new: true });
    expect(claimed as unknown).toEqual({
      _id: 'outbox-1',
      routingKey: 'order.created',
      payload: { seq: 1 },
      messageId: 'chain-1',
    });
  });

  it('marks a claimed message as sent', async () => {
    const model = createFakeOutboxModel();
    const repository = new OutboxMessageRepository(model as unknown as OutboxModel);

    await repository.markSent('outbox-1');

    expect(model.updateOne).toHaveBeenCalledWith(
      { _id: 'outbox-1' },
      { $set: { status: 'sent', sentAt: expect.any(Number) } },
    );
  });

  it('releases a failed message back to pending', async () => {
    const model = createFakeOutboxModel();
    const repository = new OutboxMessageRepository(model as unknown as OutboxModel);

    await repository.release('outbox-1');

    expect(model.updateOne).toHaveBeenCalledWith({ _id: 'outbox-1' }, { $set: { status: 'pending' } });
  });

  it('returns the leftovers of a dead pass to pending', async () => {
    const model = createFakeOutboxModel();
    const repository = new OutboxMessageRepository(model as unknown as OutboxModel);

    await repository.releaseSending();

    expect(model.updateMany).toHaveBeenCalledWith({ status: 'sending' }, { $set: { status: 'pending' } });
  });
});
