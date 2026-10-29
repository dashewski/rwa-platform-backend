/**
 * Stand-in for the signers-manager RabbitMQClient: records consumer
 * registrations, ack / nack / park calls.
 */
import { mock } from 'bun:test';
import type { ConsumeMessage } from 'amqplib';
import type { BaseRabbitMQClient } from '@shared/rabbitmq/src/baseRabbitmq.client';

export const RESPONSES_QUEUE = 'sign.responses';

export function createFakeRabbitClient() {
  const state = {
    connected: true,
    consumerTags: [] as string[],
    acked: [] as ConsumeMessage[],
    nacked: [] as Array<{ message: ConsumeMessage; requeue: boolean }>,
    parked: [] as Array<{ queue: string; payload: unknown }>,
    handlers: new Map<string, (message: ConsumeMessage | null) => Promise<void>>(),
    consumedOptions: [] as Array<{ queue: string; options: unknown }>,
    deferAfterAttempts: 3,
    parkAfterCycles: 3,
  };

  let sequence = 0;

  const client = {
    state,
    channelName: 'signers-manager',

    getSignResponsesQueue: () => RESPONSES_QUEUE,

    consume: mock(
      async (
        queue: string,
        handler: (message: ConsumeMessage | null) => Promise<void>,
        options?: { prefetch?: number },
      ): Promise<string> => {
        state.consumedOptions.push({ queue, options });
        const consumerTag = `ctag-${(sequence += 1)}`;
        state.consumerTags.push(consumerTag);
        state.handlers.set(queue, handler);
        return consumerTag;
      },
    ),

    cancelConsumer: mock(async (consumerTag: string): Promise<void> => {
      state.consumerTags = state.consumerTags.filter((tag) => tag !== consumerTag);
    }),

    ack: mock(async (message: ConsumeMessage): Promise<void> => {
      state.acked.push(message);
    }),

    nack: mock(async (message: ConsumeMessage, requeue = true): Promise<void> => {
      state.nacked.push({ message, requeue });
    }),

    park: mock(async (queue: string, payload: unknown): Promise<void> => {
      state.parked.push({ queue, payload });
    }),

    getQueueDeferAfterAttempts: mock((): number => state.deferAfterAttempts),
    getQueueParkAfterCycles: mock((): number => state.parkAfterCycles),
    isConnected: mock((): boolean => state.connected),
  };

  return client;
}

export type FakeRabbitClient = ReturnType<typeof createFakeRabbitClient>;

export const asRabbitClient = (fake: FakeRabbitClient): BaseRabbitMQClient => fake as unknown as BaseRabbitMQClient;
