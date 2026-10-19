/**
 * In-memory fake of RabbitMQClient (shared/rabbitmq/src/rabbitmq.client.ts).
 *
 * The real client talks to a broker; this fake mirrors its public API with
 * bun:test mocks and captures every handler registered through consume() in
 * `consumedHandlers` (keyed by queue name), so daemon tests can assert wiring.
 * sent/acked/nacked messages are recorded for assertions.
 */
import { mock } from 'bun:test';
import type { ConsumeMessage } from 'amqplib';

export function createFakeRabbitMQClient() {
  const consumedHandlers = new Map<string, (message: ConsumeMessage | null) => Promise<void>>();
  const sent: Array<{ queue: string; content: any; options?: unknown }> = [];
  const acked: ConsumeMessage[] = [];
  const nacked: Array<{ message: ConsumeMessage; requeue: boolean }> = [];

  let connected = true;

  return {
    // Handlers registered through consume(); consumers re-register on reconnect
    // in the real client, so the newest handler per queue wins here as well.
    consumedHandlers,
    sent,
    acked,
    nacked,

    initialize: mock(async (): Promise<void> => {}),

    isConnected: mock(() => connected),

    setConnected: (value: boolean) => {
      connected = value;
    },

    isExchangeRegistered: mock((_name: string) => true),

    getExchange: mock((name: string) => name),

    getQueue: mock((name: string) => name),

    connect: mock(async (): Promise<void> => {}),

    disconnect: mock(async (): Promise<void> => {}),

    setupQueue: mock(async (_queue: string, _options?: unknown): Promise<void> => {}),

    setupExchange: mock(async (_exchange: string, _type: string, _options?: unknown): Promise<void> => {}),

    bindQueue: mock(async (_queue: string, _exchange: string, _pattern: string): Promise<void> => {}),

    publish: mock(async (_exchange: string, _routingKey: string, _content: unknown, _options?: unknown): Promise<void> => {}),

    sendToQueue: mock(async (queue: string, content: any, options?: unknown): Promise<void> => {
      sent.push({ queue, content, options });
    }),

    consume: mock(
      async (
        queue: string,
        handler: (message: ConsumeMessage | null) => Promise<void>,
        _options?: { noAck?: boolean; prefetch?: number },
      ): Promise<void> => {
        consumedHandlers.set(queue, handler);
      },
    ),

    ack: mock(async (message: ConsumeMessage): Promise<void> => {
      acked.push(message);
    }),

    nack: mock(async (message: ConsumeMessage, requeue: boolean = true): Promise<void> => {
      nacked.push({ message, requeue });
    }),
  };
}

export type FakeRabbitMQClient = ReturnType<typeof createFakeRabbitMQClient>;
