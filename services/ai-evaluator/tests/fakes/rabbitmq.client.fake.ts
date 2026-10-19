/**
 * In-memory fake of RabbitMQClient for unit tests.
 *
 * The real client owns an amqp connection and channel. Tests use this fake to
 * keep the client and daemon layers isolated: no broker, no network,
 * deterministic acknowledgements. The public API mirrors
 * shared/rabbitmq/src/baseRabbitmq.client.ts, and every method is wrapped in
 * bun:test mock() so interactions can be asserted.
 *
 * consume() records the registered handler per queue, so a test can drive it
 * with synthetic amqplib messages without a broker. sent/acked/nacked messages
 * are recorded for assertions.
 */
import { mock } from 'bun:test';
import type { ConsumeMessage } from 'amqplib';

export type FakeConsumer = {
  queue: string;
  handler: (message: ConsumeMessage | null) => Promise<void>;
  options?: { noAck?: boolean; prefetch?: number };
};

export function createFakeRabbitMQClient() {
  const consumers = new Map<string, FakeConsumer>();
  const sent: Array<{ queue: string; content: any; options?: any }> = [];
  const acked: ConsumeMessage[] = [];
  const nacked: Array<{ message: ConsumeMessage; requeue: boolean }> = [];

  let connected = true;

  const client = {
    sent,
    acked,
    nacked,
    consumers,

    initialize: mock(async (): Promise<void> => {}),

    connect: mock(async (): Promise<void> => {}),

    disconnect: mock(async (): Promise<void> => {}),

    isConnected: mock(() => connected),

    setConnected: (value: boolean) => {
      connected = value;
    },

    isExchangeRegistered: mock((_exchange: string) => true),

    getExchange: mock((name: string) => name),

    getQueue: mock((name: string) => name),

    setupQueue: mock(async (_queue: string, _options?: any): Promise<void> => {}),

    setupExchange: mock(async (_exchange: string, _type: string, _options?: any): Promise<void> => {}),

    bindQueue: mock(async (_queue: string, _exchange: string, _pattern: string): Promise<void> => {}),

    publish: mock(async (_exchange: string, _routingKey: string, _content: any, _options?: any): Promise<void> => {}),

    sendToQueue: mock(async (queue: string, content: any, options?: any): Promise<void> => {
      sent.push({ queue, content, options });
    }),

    consume: mock(
      async (
        queue: string,
        handler: (message: ConsumeMessage | null) => Promise<void>,
        options?: { noAck?: boolean; prefetch?: number },
      ): Promise<string> => {
        consumers.set(queue, { queue, handler, options });
        return `ctag-${queue}`;
      },
    ),

    cancelConsumer: mock(async (_consumerTag: string): Promise<void> => {}),

    ack: mock(async (message: ConsumeMessage): Promise<void> => {
      acked.push(message);
    }),

    nack: mock(async (message: ConsumeMessage, requeue = true): Promise<void> => {
      nacked.push({ message, requeue });
    }),

    /** Consumer registered through consume(), so tests can invoke the handler directly. */
    getConsumer(): FakeConsumer | null {
      return consumers.values().next().value ?? null;
    },
  };

  return client;
}

export type FakeRabbitMQClient = ReturnType<typeof createFakeRabbitMQClient>;

/**
 * Builds a synthetic amqplib message as delivered by the broker. Passing a string
 * sends it as the raw body (useful for malformed-payload tests), any other value
 * is JSON stringified like the producers of evaluation.requests do.
 */
export function createConsumeMessage(body: unknown, routingKey = 'requests'): ConsumeMessage {
  const content = typeof body === 'string' ? body : JSON.stringify(body);

  return {
    content: Buffer.from(content),
    fields: {
      routingKey,
      redelivered: false,
      deliveryTag: 1,
      exchange: 'evaluation',
      consumerTag: 'ctag',
    },
    properties: { messageId: 'msg-1' },
  } as unknown as ConsumeMessage;
}
