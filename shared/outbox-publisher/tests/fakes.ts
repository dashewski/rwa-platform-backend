/**
 * Shared test doubles for the outbox-publisher package.
 *
 * Everything here is in-memory: no database, no broker, no network. The fakes
 * mirror the exact surface the package uses, so swapping them in is a plain
 * `as unknown as X` cast at the construction site.
 */
import { mock } from 'bun:test';
import type { BaseRabbitMQClient } from '@shared/rabbitmq/src/baseRabbitmq.client';

export const EXCHANGE = 'blockchain.events';

export type PublishedMessage = {
  exchange: string;
  routingKey: string;
  payload: unknown;
  options: { messageId?: string } | undefined;
};

/**
 * Minimal stand-in for BaseRabbitMQClient: records publishes and lets a test
 * make the next publish (or every publish) fail with a given error.
 */
export function createFakeRabbitClient() {
  const published: PublishedMessage[] = [];
  const state = {
    registeredExchanges: new Set<string>([EXCHANGE]),
    failNextPublish: null as Error | null,
    failPublishAlways: null as Error | null,
  };

  const client = {
    published,
    state,

    isExchangeRegistered: mock((exchange: string): boolean => state.registeredExchanges.has(exchange)),

    publish: mock(
      async (
        exchange: string,
        routingKey: string,
        payload: unknown,
        options?: { messageId?: string },
      ): Promise<void> => {
        if (state.failPublishAlways) {
          throw state.failPublishAlways;
        }

        if (state.failNextPublish) {
          const error = state.failNextPublish;
          state.failNextPublish = null;
          throw error;
        }

        published.push({ exchange, routingKey, payload, options });
      },
    ),
  };

  return client;
}

export type FakeRabbitClient = ReturnType<typeof createFakeRabbitClient>;

export function asRabbitClient(fake: FakeRabbitClient): BaseRabbitMQClient {
  return fake as unknown as BaseRabbitMQClient;
}
