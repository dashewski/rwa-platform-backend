/**
 * Test doubles for the signers-manager inbox daemon: the RabbitMQ client, the
 * inbox consumer service and the signatures service. No broker, no database.
 */
import { mock } from 'bun:test';
import type { ConsumeMessage } from 'amqplib';
import type { BaseRabbitMQClient } from '@shared/rabbitmq/src/baseRabbitmq.client';
import type { InboxConsumerService } from '@shared/inbox-consumer';
import type { SignaturesService } from '../../src/services/signatures.service';

export const RESPONSES_QUEUE = 'sign.responses';

export function makeMessage(
  routingKey: string,
  body: unknown,
  options: { messageId?: string | null; raw?: string; headers?: Record<string, unknown> } = {},
): ConsumeMessage {
  const raw = options.raw ?? JSON.stringify(body);
  const messageId = options.messageId === undefined ? 'task-1:0xsigner' : options.messageId;

  return {
    content: Buffer.from(raw),
    fields: {
      routingKey,
      redelivered: false,
      deliveryTag: 1,
      exchange: 'sign.exchange',
      consumerTag: 'ctag',
    },
    properties: {
      ...(messageId === null ? {} : { messageId }),
      ...(options.headers ? { headers: options.headers } : {}),
    },
  } as unknown as ConsumeMessage;
}

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

export function createFakeConsumerService() {
  const state = {
    markers: new Set<string>(),
    commits: [] as string[],
  };

  const service = {
    state,

    commit: mock(async (messageId: string): Promise<void> => {
      state.commits.push(messageId);
      state.markers.add(messageId);
    }),

    isCommitted: mock(async (messageId: string): Promise<boolean> => state.markers.has(messageId)),
  };

  return service;
}

export type FakeConsumerService = ReturnType<typeof createFakeConsumerService>;

export const asConsumerService = (fake: FakeConsumerService): InboxConsumerService =>
  fake as unknown as InboxConsumerService;

export function createFakeSignaturesService() {
  const state = {
    responses: [] as Array<{ taskId: string; signer: string; hash: string; signature: string }>,
    error: null as unknown,
  };

  const service = {
    state,

    addSignature: mock(
      async (
        response: { taskId: string; signer: string; hash: string; signature: string },
        commitInbox: () => Promise<void>,
      ) => {
        if (state.error) throw state.error;
        await commitInbox();
        state.responses.push(response);
        return { signature: { id: 'sig-1' }, isCompleted: false };
      },
    ),
  };

  return service;
}

export type FakeSignaturesService = ReturnType<typeof createFakeSignaturesService>;

export const asSignaturesService = (fake: FakeSignaturesService): SignaturesService =>
  fake as unknown as SignaturesService;
