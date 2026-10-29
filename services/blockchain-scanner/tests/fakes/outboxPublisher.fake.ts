/**
 * In-memory fake of the outbox publisher for unit tests.
 *
 * The real publisher stores every message in the outbox collection; the
 * publisher daemon inside @shared/outbox-publisher relays it to RabbitMQ
 * later. Tests use this fake to keep the scanner isolated: no database, no
 * broker, no network, deterministic queue order. The public API mirrors the
 * surface the scanner uses from @shared/outbox-publisher/src/services/
 * outboxPublisher.service.ts, and every method is wrapped in bun:test mock()
 * so interactions can be asserted.
 */
import { mock } from 'bun:test';

export const EXCHANGE = 'blockchain.events';

export type FakeQueuedMessage = {
  exchange: string;
  routingKey: string;
  payload: any;
  messageId: string;
};

export function createFakeOutboxPublisher() {
  const queued: FakeQueuedMessage[] = [];
  const state = {
    // When set, publish() rejects for this routing key; mirrors an outbox
    // insert failure on one event name. Every other publish still succeeds.
    failPublishFor: null as string | null,
  };

  const publisher = {
    queued,
    state,

    rabbitClient: {
      getBlockchainEventsExchange: () => EXCHANGE,
    },

    publish: mock(async (exchange: string, routingKey: string, payload: any, messageId: string): Promise<void> => {
      if (state.failPublishFor === routingKey) {
        throw new Error(`publish failed for routing key ${routingKey}`);
      }

      queued.push({ exchange, routingKey, payload, messageId });
    }),
  };

  return publisher;
}

export type FakeOutboxPublisher = ReturnType<typeof createFakeOutboxPublisher>;
