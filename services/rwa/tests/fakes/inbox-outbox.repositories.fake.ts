/**
 * In-memory fakes of the inbox/outbox repositories used by the component tests.
 *
 * They stand in for the Mongo-backed repositories so the app can be assembled
 * without a database: the inbox one runs the handler immediately (dedup off),
 * the outbox one keeps messages claimed-nothing, i.e. never sends.
 */
import { mock } from 'bun:test';

export function createFakeInboxConsumerMessageRepository() {
  return {
    runOnce: mock(async (_messageId: string, handler: () => Promise<unknown>) => handler()),
  };
}

export function createFakeOutboxPublisherMessageRepository() {
  return {
    create: mock(async (doc: Record<string, unknown>) => ({ _id: 'outbox-1', ...doc })),
    releaseSending: mock(async (_exchange: string) => 0),
    markSent: mock(async (_id: unknown) => undefined),
    release: mock(async (_id: unknown) => undefined),
    claimNext: mock(async (_exchange: string) => null),
  };
}

export type FakeInboxConsumerMessageRepository = ReturnType<typeof createFakeInboxConsumerMessageRepository>;
export type FakeOutboxPublisherMessageRepository = ReturnType<typeof createFakeOutboxPublisherMessageRepository>;
