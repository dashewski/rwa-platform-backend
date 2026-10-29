/**
 * Test doubles for the signer service: the RabbitMQ client, the inbox consumer
 * service and the signature service. Nothing here touches a broker or a
 * database.
 */
import { mock } from 'bun:test';
import type { ConsumeMessage } from 'amqplib';
import type { BaseRabbitMQClient } from '@shared/rabbitmq/src/baseRabbitmq.client';
import type { InboxConsumerService } from '@shared/inbox-consumer';
import type { SignatureService } from '../src/services/signature.service';

export const SIGNER_NAME = 'signer1';
export const REQUESTS_QUEUE = `sign.requests.${SIGNER_NAME}`;

export function makeMessage(
  routingKey: string,
  body: unknown,
  options: { messageId?: string | null; raw?: string; headers?: Record<string, unknown> } = {},
): ConsumeMessage {
  const raw = options.raw ?? JSON.stringify(body);
  const messageId = options.messageId === undefined ? 'task-1' : options.messageId;

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
    failAck: null as Error | null,
    failNack: null as Error | null,
  };

  let sequence = 0;

  const client = {
    state,
    channelName: SIGNER_NAME,

    getSignRequestsQueue: () => REQUESTS_QUEUE,

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
      if (state.failAck) throw state.failAck;
    }),

    nack: mock(async (message: ConsumeMessage, requeue = true): Promise<void> => {
      state.nacked.push({ message, requeue });
      if (state.failNack) throw state.failNack;
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

export function createFakeSignatureService() {
  const state = {
    tasks: [] as Array<{ hash: string; taskId: string; expired: number }>,
    error: null as unknown,
  };

  const service = {
    state,

    signHash: mock(
      async (task: { hash: string; taskId: string; expired: number }, commitInbox: () => Promise<void>) => {
        if (state.error) throw state.error;
        await commitInbox();
        state.tasks.push(task);
        return { signer: '0xsigner', signature: '0xsig' };
      },
    ),
  };

  return service;
}

export type FakeSignatureService = ReturnType<typeof createFakeSignatureService>;

export const asSignatureService = (fake: FakeSignatureService): SignatureService => fake as unknown as SignatureService;
