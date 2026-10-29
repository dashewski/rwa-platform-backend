/**
 * In-memory stand-in for an amqplib ConfirmChannel.
 *
 * Mirrors the exact surface BaseRabbitMQClient touches: assertExchange /
 * assertQueue / bindQueue / prefetch / consume / cancel / ack / nack /
 * publish / once / on / off / close. Every call is recorded, so a test reads
 * the broker interaction off the channel instead of mocking each method.
 */


export type PublishedMessage = {
  exchange: string;
  routingKey: string;
  body: Buffer;
  options: Record<string, unknown>;
  confirm: (error?: Error | null) => void;
  settled: boolean;
};

export type Listener = (...args: any[]) => void;

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
