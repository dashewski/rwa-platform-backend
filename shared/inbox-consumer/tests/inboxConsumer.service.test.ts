/**
 * Unit tests for InboxConsumerService — the dedup marker API only.
 *
 * The service no longer runs the handler and no longer opens a transaction:
 * the caller commits the marker inside its own transaction, and the daemon
 * decides ack / retry from the marker. What is pinned down here: commit()
 * delegates to the repository and lets the driver error through, isCommitted()
 * reports what the repository found.
 */
import './setup';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { InboxConsumerService } from '../src/services/inboxConsumer.service';
import type { InboxConsumerMessageRepository } from '../src/repositories/inboxConsumerMessage.repository';

const MESSAGE_ID = '31337:0xabc:3';

function createFakeRepository() {
  const state = {
    markers: new Set<string>(),
    created: [] as string[],
    read: [] as string[],
    createError: null as unknown,
    existsError: null as unknown,
  };

  const repository = {
    state,

    create: mock(async (messageId: string): Promise<void> => {
      state.created.push(messageId);
      if (state.createError) throw state.createError;
      if (state.markers.has(messageId)) {
        throw Object.assign(
          new Error('E11000 duplicate key error collection: inboxconsumermessages index: messageId_1'),
          { code: 11000 },
        );
      }

      state.markers.add(messageId);
    }),

    exists: mock(async (messageId: string): Promise<boolean> => {
      state.read.push(messageId);
      if (state.existsError) throw state.existsError;

      return state.markers.has(messageId);
    }),
  };

  return repository;
}

describe('InboxConsumerService (unit, fake repository)', () => {
  let repository: ReturnType<typeof createFakeRepository>;
  let service: InboxConsumerService;

  beforeEach(() => {
    repository = createFakeRepository();
    service = new InboxConsumerService(repository as unknown as InboxConsumerMessageRepository);
  });

  test('commit writes the marker through the repository', async () => {
    await service.commit(MESSAGE_ID);

    expect(repository.state.created).toEqual([MESSAGE_ID]);
    expect(repository.state.markers.has(MESSAGE_ID)).toBe(true);
  });

  test('a duplicate marker (11000) is thrown to the caller, not swallowed', async () => {
    await service.commit(MESSAGE_ID);

    const failure = await service.commit(MESSAGE_ID).catch((error: { code?: number }) => error);

    expect((failure as { code?: number }).code).toBe(11000);
  });

  test('isCommitted reports an existing marker', async () => {
    await service.commit(MESSAGE_ID);

    await expect(service.isCommitted(MESSAGE_ID)).resolves.toBe(true);
    await expect(service.isCommitted('unknown')).resolves.toBe(false);
    expect(repository.state.read).toEqual([MESSAGE_ID, 'unknown']);
  });

  test('a read failure is thrown to the caller (the daemon decides to retry)', async () => {
    repository.state.existsError = new Error('MongoServerSelectionError: server selection timed out');

    await expect(service.isCommitted(MESSAGE_ID)).rejects.toThrow('server selection timed out');
  });

  test('a write failure that is not a duplicate key is thrown to the caller', async () => {
    repository.state.createError = new Error('MongoServerSelectionError: server selection timed out');

    await expect(service.commit(MESSAGE_ID)).rejects.toThrow('server selection timed out');
  });
});
