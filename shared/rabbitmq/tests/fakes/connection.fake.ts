/**
 * In-memory stand-in for an amqplib connection: hands out one FakeChannel and
 * records the connection-level listeners (close / error).
 */

import { FakeChannel, type Listener } from './channel.fake';

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
