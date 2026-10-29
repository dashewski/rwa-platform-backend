/**
 * Stand-in for BaseRabbitMQClient: records consumer registrations, the ack /
 * nack / park calls and lets a test make any of them fail.
 */
import { mock } from 'bun:test';
import type { ConsumeMessage } from 'amqplib';
import type { BaseRabbitMQClient } from '@shared/rabbitmq/src/baseRabbitmq.client';

export function createFakeRabbitClient() {
  const state = {
    connected: true,
    consumerTags: [] as string[],
    acked: [] as ConsumeMessage[],
    nacked: [] as Array<{ message: ConsumeMessage; requeue: boolean }>,
    parked: [] as Array<{ queue: string; payload: unknown; messageId?: string }>,
    cancelled: [] as string[],
    handlers: new Map<string, (message: ConsumeMessage | null) => Promise<void>>(),
    consumedOptions: [] as Array<{ queue: string; options: unknown }>,
    deferAfterAttempts: new Map<string, number>(),
    parkAfterCycles: new Map<string, number>(),
    failConsumeFor: null as string | null,
    failCancel: null as Error | null,
    failAck: null as Error | null,
    failNack: null as Error | null,
    failPark: null as Error | null,
  };

  let sequence = 0;

  const client = {
    state,

    consume: mock(
      async (
        queue: string,
        handler: (message: ConsumeMessage | null) => Promise<void>,
        options?: { noAck?: boolean; prefetch?: number },
      ): Promise<string> => {
        state.consumedOptions.push({ queue, options });
        if (state.failConsumeFor === queue) {
          throw new Error(`NOT_FOUND - no queue '${queue}' in vhost '/'`);
        }

        const consumerTag = `ctag-${(sequence += 1)}`;
        state.consumerTags.push(consumerTag);
        state.handlers.set(consumerTag, handler);
        state.handlers.set(queue, handler);

        return consumerTag;
      },
    ),

    cancelConsumer: mock(async (consumerTag: string): Promise<void> => {
      state.cancelled.push(consumerTag);
      if (state.failCancel) throw state.failCancel;
    }),

    ack: mock(async (message: ConsumeMessage): Promise<void> => {
      state.acked.push(message);
      if (state.failAck) throw state.failAck;
    }),

    nack: mock(async (message: ConsumeMessage, requeue = true): Promise<void> => {
      state.nacked.push({ message, requeue });
      if (state.failNack) throw state.failNack;
    }),

    park: mock(async (queue: string, payload: unknown, options?: { messageId?: string }): Promise<void> => {
      state.parked.push({ queue, payload, messageId: options?.messageId });
      if (state.failPark) throw state.failPark;
    }),

    getQueueDeferAfterAttempts: mock((queue: string): number => {
      return state.deferAfterAttempts.get(queue) ?? Number.POSITIVE_INFINITY;
    }),

    getQueueParkAfterCycles: mock((queue: string): number => {
      return state.parkAfterCycles.get(queue) ?? Number.POSITIVE_INFINITY;
    }),

    isConnected: mock((): boolean => state.connected),
  };

  return client;
}

export type FakeRabbitClient = ReturnType<typeof createFakeRabbitClient>;

export function asRabbitClient(fake: FakeRabbitClient): BaseRabbitMQClient {
  return fake as unknown as BaseRabbitMQClient;
}
