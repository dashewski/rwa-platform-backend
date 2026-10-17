/**
 * In-memory fake of RabbitMQClient for unit tests.
 *
 * The real client owns an amqp-connection-manager connection and channel.
 * Tests use this fake to keep the clients isolated: no broker, no network.
 * The public API mirrors shared/rabbitmq/src/rabbitmq.client.ts, and every
 * method is wrapped in bun:test mock() so interactions can be asserted.
 *
 * consume() records the registered handler per queue and returns a consumer
 * tag; a test can pick the handler up with consumerFor(queue) and feed it a
 * synthetic message, and cancelConsumer(tag) removes the consumer like the
 * halt path of the ordered consumer does.
 */
import { mock } from 'bun:test';

export type FakeConsumeMessage = {
  content: Buffer;
  properties?: { messageId?: string; headers?: Record<string, unknown> };
};

export type FakeConsumeHandler = (message: FakeConsumeMessage | null) => Promise<void>;

export function createFakeRabbitMQClient() {
  const consumers = new Map<string, FakeConsumeHandler>();
  const consumerTags = new Map<string, string>();
  const state = { connected: false };

  const client = {
    state,
    consumers,

    consumerFor: (queue: string) => consumers.get(queue),

    connect: mock(async () => {
      state.connected = true;
    }),

    disconnect: mock(async () => {
      state.connected = false;
    }),

    setupQueue: mock(async (_queue: string, _options?: any) => {}),

    setupExchange: mock(async (_exchange: string, _type: string, _options?: any) => {}),

    bindQueue: mock(async (_queue: string, _exchange: string, _pattern: string) => {}),

    publish: mock(async (_exchange: string, _routingKey: string, _content: any, _options?: any) => {}),

    sendToQueue: mock(async (_queue: string, _content: any, _options?: any) => {}),

    consume: mock(
      async (
        queue: string,
        handler: FakeConsumeHandler,
        _options?: { noAck?: boolean; prefetch?: number },
      ) => {
        const consumerTag = `consumer-${queue}-${consumerTags.size + 1}`;
        consumers.set(queue, handler);
        consumerTags.set(consumerTag, queue);
        return consumerTag;
      },
    ),

    ack: mock(async (_message: FakeConsumeMessage) => {}),

    nack: mock(async (_message: FakeConsumeMessage, _requeue: boolean = true) => {}),

    cancelConsumer: mock(async (consumerTag: string) => {
      const queue = consumerTags.get(consumerTag);
      if (queue) {
        consumers.delete(queue);
        consumerTags.delete(consumerTag);
      }
    }),
  };

  return client;
}

export type FakeRabbitMQClient = ReturnType<typeof createFakeRabbitMQClient>;
