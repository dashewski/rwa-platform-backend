/**
 * In-memory fake of OutboxPublisherService.
 *
 * The real publisher stores the message in the outbox collection and a daemon
 * relays it to the broker; this fake only records publish() calls.
 */
import { mock } from 'bun:test';

export function createFakeOutboxPublisher() {
  return {
    publish: mock(
      async (_exchange: string, _routingKey: string, _payload: unknown, _messageId: string): Promise<void> => {},
    ),
  };
}

export type FakeOutboxPublisher = ReturnType<typeof createFakeOutboxPublisher>;
