/**
 * In-memory stand-in for amqplib's connect(): hands out FakeConnection
 * instances and lets a test fail the next attempt or every attempt.
 */

import { FakeConnection } from './connection.fake';
import type { FakeChannel } from './channel.fake';

export type FakeBroker = ReturnType<typeof createFakeBroker>;

export function createFakeBroker() {
  const state = {
    connectCalls: [] as Array<{ uri: string; options?: Record<string, unknown> }>,
    connections: [] as FakeConnection[],
    /** When set, the next connect attempt rejects with this error. */
    failNextConnect: null as Error | null,
    /** When set, every connect attempt rejects with this error. */
    failAllConnects: null as Error | null,
  };

  async function connect(uri: string, options?: Record<string, unknown>): Promise<FakeConnection> {
    state.connectCalls.push({ uri, options });

    if (state.failAllConnects) throw state.failAllConnects;

    if (state.failNextConnect) {
      const error = state.failNextConnect;
      state.failNextConnect = null;
      throw error;
    }

    const connection = new FakeConnection();
    state.connections.push(connection);

    return connection;
  }

  return {
    state,
    connect,
    get channel(): FakeChannel {
      return state.connections[state.connections.length - 1].channel;
    },
    get connection(): FakeConnection {
      return state.connections[state.connections.length - 1];
    },
  };
}
