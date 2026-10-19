/**
 * In-memory fake of OutboxPublisherService for unit tests.
 *
 * The real publisher stores the message in the outbox collection and a daemon
 * relays it to the broker; this fake records publish() calls and keeps the
 * published payloads in `published`, so a test can assert the exact sequence of
 * completed/failed results without digging into mock calls.
 */
import { mock } from 'bun:test';

export function createFakeOutboxPublisher() {
  const published: Array<Record<string, unknown>> = [];

  const publisher = {
    published,

    publish: mock(
      async (
        _exchange: string,
        _routingKey: string,
        payload: Record<string, unknown>,
        _messageId: string,
      ): Promise<void> => {
        published.push(payload);
      },
    ),
  };

  return publisher;
}

export type FakeOutboxPublisher = ReturnType<typeof createFakeOutboxPublisher>;
