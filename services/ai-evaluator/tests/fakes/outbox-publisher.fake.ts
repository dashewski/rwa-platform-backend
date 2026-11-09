/**
 * In-memory fake of OutboxPublisherService for unit tests.
 *
 * The real publisher stores the message in the outbox collection and a daemon
 * relays it to the broker; this fake records publish() calls and keeps the
 * published payloads in `published`, so a test can assert the exact sequence of
 * queued requests and results without digging into mock calls.
 */
import { mock } from 'bun:test';

export function createFakeOutboxPublisher() {
  const published: Array<Record<string, unknown>> = [];
  const exchanges: string[] = [];

  const publisher = {
    rabbitClient: {
      getEvaluationRequestsExchange: () => 'evaluation.requests',
      getEvaluationResultsExchange: () => 'evaluation.results',
    },
    published,
    exchanges,

    publish: mock(
      async (
        exchange: string,
        _routingKey: string,
        payload: Record<string, unknown>,
        _messageId: string,
      ): Promise<void> => {
        exchanges.push(exchange);
        published.push(payload);
      },
    ),
  };

  return publisher;
}

export type FakeOutboxPublisher = ReturnType<typeof createFakeOutboxPublisher>;
