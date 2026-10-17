/**
 * In-memory fake of the ordered publisher for unit tests.
 *
 * The real publisher stores every message in the outbox collection; the daemon
 * inside @shared/ordered-publisher relays it to RabbitMQ later. Tests use this
 * fake to keep the scanner isolated: no database, no broker, no network,
 * deterministic queue order. The public API mirrors the surface the scanner
 * uses from @shared/ordered-publisher/src/services/orderedPublisher.service.ts,
 * and every method is wrapped in bun:test mock() so interactions can be asserted.
 */
import { mock } from 'bun:test';

export type FakeQueuedMessage = {
  routingKey: string;
  payload: any;
  messageId: string;
};

export function createFakeOrderedPublisher() {
  const queued: FakeQueuedMessage[] = [];
  const state = {
    // When set, publish() rejects for this routing key; mirrors an outbox
    // insert failure on one event name. Every other publish still succeeds.
    failPublishFor: null as string | null,
  };

  const publisher = {
    queued,
    state,

    publish: mock(async (routingKey: string, payload: any, messageId: string): Promise<void> => {
      if (state.failPublishFor === routingKey) {
        throw new Error(`publish failed for routing key ${routingKey}`);
      }

      queued.push({ routingKey, payload, messageId });
    }),
  };

  return publisher;
}

export type FakeOrderedPublisher = ReturnType<typeof createFakeOrderedPublisher>;
