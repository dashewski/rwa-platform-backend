/**
 * In-memory fake of OutboxPublisherService: records every queued message so a
 * test can assert the exact exchange / routing key / payload / messageId.
 */
import { mock } from 'bun:test';

export function createFakeOutbox() {
  const state = {
    calls: [] as Array<{ exchange: string; routingKey: string; payload: any; messageId: string }>,
    failWith: null as unknown,
  };

  const outbox = {
    state,

    publish: mock(async (exchange: string, routingKey: string, payload: any, messageId: string): Promise<void> => {
      if (state.failWith) throw state.failWith;
      state.calls.push({ exchange, routingKey, payload, messageId });
    }),
  };

  return outbox;
}

export type FakeOutbox = ReturnType<typeof createFakeOutbox>;
