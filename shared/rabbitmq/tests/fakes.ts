/**
 * In-memory stand-in for amqplib, used to unit-test BaseRabbitMQClient without
 * a broker, a socket or a timer of real length.
 *
 * The fake mirrors the exact surface the client touches:
 *   connect(uri, { heartbeat }) -> connection
 *   connection.createConfirmChannel() -> ConfirmChannel
 *   channel: assertExchange / assertQueue / bindQueue / prefetch / consume /
 *            cancel / ack / nack / publish / once / on / off / close
 *
 * Every call is recorded, and a test can inject the broker's answer with
 * handlers: `onPublish` decides confirm/return/failure per message,
 * `failConnect` makes the next connect attempt reject.
 */

import type { ConsumeMessage } from 'amqplib';

export type PublishedMessage = {
  exchange: string;
  routingKey: string;
  body: Buffer;
  options: Record<string, unknown>;
  confirm: (error?: Error | null) => void;
  settled: boolean;
};

type Listener = (...args: any[]) => void;

export class FakeChannel {
  readonly assertedExchanges: Array<{ name: string; type: string; options?: Record<string, unknown> }> = [];
  readonly assertedQueues: Array<{ name: string; options?: Record<string, unknown> }> = [];
  readonly bindings: Array<{ queue: string; exchange: string; routingKey: string }> = [];
  readonly prefetches: Array<{ count: number; global: boolean }> = [];
  readonly consumed: Array<{ queue: string; options?: Record<string, unknown> }> = [];
  readonly cancelled: string[] = [];
  readonly published: PublishedMessage[] = [];
  readonly acked: unknown[] = [];
  readonly nacked: Array<{ message: unknown; requeue: boolean }> = [];

  consumerHandler: ((message: unknown) => void) | null = null;
  closed = false;

  /** Test hooks. */
  onPublish: ((message: PublishedMessage) => void) | null = null;
  failAssertQueue: Error | null = null;
  failAck: Error | null = null;
  failNack: Error | null = null;
  failCancel: Error | null = null;

  private readonly listeners = new Map<string, Listener[]>();

  async assertExchange(name: string, type: string, options?: Record<string, unknown>): Promise<void> {
    this.assertedExchanges.push({ name, type, options });
  }

  async assertQueue(name: string, options?: Record<string, unknown>): Promise<void> {
    if (this.failAssertQueue) throw this.failAssertQueue;

    this.assertedQueues.push({ name, options });
  }

  async bindQueue(queue: string, exchange: string, routingKey: string): Promise<void> {
    this.bindings.push({ queue, exchange, routingKey });
  }

  async prefetch(count: number, global = false): Promise<void> {
    this.prefetches.push({ count, global });
  }

  async consume(
    queue: string,
    handler: (message: unknown) => void,
    options?: Record<string, unknown>,
  ): Promise<{ consumerTag: string }> {
    this.consumed.push({ queue, options });
    this.consumerHandler = handler;

    return { consumerTag: String(options?.consumerTag ?? 'fake-tag') };
  }

  async cancel(consumerTag: string): Promise<void> {
    if (this.failCancel) throw this.failCancel;

    this.cancelled.push(consumerTag);
  }

  ack(message: unknown): void {
    if (this.failAck) throw this.failAck;

    this.acked.push(message);
  }

  nack(message: unknown, _allUpTo: boolean, requeue: boolean): void {
    if (this.failNack) throw this.failNack;

    this.nacked.push({ message, requeue });
  }

  publish(
    exchange: string,
    routingKey: string,
    body: Buffer,
    options: Record<string, unknown>,
    confirm: (error?: Error | null) => void,
  ): void {
    const record: PublishedMessage = {
      exchange,
      routingKey,
      body,
      options,
      confirm: (error) => {
        record.settled = true;
        confirm(error);
      },
      settled: false,
    };

    this.published.push(record);

    // The real confirm callback fires asynchronously; the fake keeps that
    // ordering so a test can observe "not settled yet" right after publish.
    queueMicrotask(() => {
      if (this.onPublish) {
        this.onPublish(record);
        return;
      }

      if (!record.settled) record.confirm(null);
    });
  }

  on(event: string, listener: Listener): this {
    const existing = this.listeners.get(event) ?? [];
    existing.push(listener);
    this.listeners.set(event, existing);

    return this;
  }

  once(event: string, listener: Listener): this {
    const wrapped: Listener = (...args) => {
      this.off(event, wrapped);
      listener(...args);
    };

    return this.on(event, wrapped);
  }

  off(event: string, listener: Listener): this {
    const existing = this.listeners.get(event) ?? [];
    this.listeners.set(
      event,
      existing.filter((candidate) => candidate !== listener),
    );

    return this;
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      listener(...args);
    }
  }

  /** Emits the broker's `basic.return` for an unroutable message. */
  emitReturn(message: {
    properties: { messageId?: string };
    fields: { routingKey: string; exchange: string };
  }): void {
    this.emit('return', message);
  }

  async close(): Promise<void> {
    if (this.closed) return;

    this.closed = true;
    this.emit('close');
  }
}

export class FakeConnection {
  readonly channel = new FakeChannel();
  closed = false;

  private readonly listeners = new Map<string, Listener[]>();

  async createConfirmChannel(): Promise<FakeChannel> {
    return this.channel;
  }

  on(event: string, listener: Listener): this {
    const existing = this.listeners.get(event) ?? [];
    existing.push(listener);
    this.listeners.set(event, existing);

    return this;
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      listener(...args);
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;

    this.closed = true;
    this.emit('close');
    await this.channel.close();
  }
}

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

/** Minimal AMQP message for the client's ack/nack tests. */
export function makeAmqpMessage(messageId?: string): ConsumeMessage {
  return {
    content: Buffer.from('{"a":1}'),
    fields: { routingKey: 'task', deliveryTag: 1, consumerTag: 'ctag', exchange: 'sign.exchange', redelivered: false },
    properties: (messageId === undefined ? {} : { messageId }) as ConsumeMessage['properties'],
  } as ConsumeMessage;
}
