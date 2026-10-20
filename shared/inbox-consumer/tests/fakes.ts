/**
 * Shared test doubles for the inbox-consumer package: an in-memory RabbitMQ
 * client, a scriptable consumer service and a helper that builds AMQP-like
 * messages. No database, no broker, no network.
 */
import { mock } from 'bun:test';
import type { ConsumeMessage } from 'amqplib';
import type { BaseRabbitMQClient } from '@shared/rabbitmq/src/baseRabbitmq.client';
import type { InboxConsumerService } from '../src/services/inboxConsumer.service';

export const QUEUE = 'blockchain.events.dao';

export type ConsumedMessage = ConsumeMessage;

export function makeMessage(
  routingKey: string,
  body: unknown,
  options: {
    messageId?: string | null;
    redelivered?: boolean;
    raw?: string;
    headers?: Record<string, unknown>;
  } = {},
): ConsumedMessage {
  const raw = options.raw ?? JSON.stringify(body);
  const messageId = options.messageId === undefined ? '31337:0xabc:3' : options.messageId;

  return {
    content: Buffer.from(raw),
    fields: {
      routingKey,
      redelivered: options.redelivered ?? false,
      deliveryTag: 1,
      exchange: 'blockchain.events',
      consumerTag: 'ctag',
    },
    properties: {
      ...(messageId === null ? {} : { messageId }),
      ...(options.headers ? { headers: options.headers } : {}),
    },
  } as unknown as ConsumeMessage;
}

/** x-death entry as RabbitMQ writes it: an array of {key, value} pairs. */
export function xDeathEntry(queue: string, reason: string, count: number): Array<[string, unknown]> {
  return [
    ['queue', queue],
    ['reason', reason],
    ['count', count],
  ];
}

/**
 * Stand-in for BaseRabbitMQClient: records consumer registrations, the ack /
 * nack / park calls and lets a test make any of them fail.
 */
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

/**
 * Stand-in for InboxConsumerService: it owns only the dedup marker, exactly like
 * the real service. `commit` writes the marker (and can fail with 11000, which
 * is how a duplicate delivery is recognised), `isCommitted` reads it.
 */
export function createFakeConsumerService() {
  const state = {
    markers: new Set<string>(),
    commits: [] as string[],
    reads: [] as string[],
    commitError: null as unknown,
    /** Queue of outcomes for consecutive commit() calls: 'ok' | 'duplicate' | 'fail'. */
    commitOutcomes: [] as Array<'ok' | 'duplicate' | 'fail'>,
    readError: null as unknown,
    /** Marker ids that exist for isCommitted() regardless of commit() calls. */
    preexisting: new Set<string>(),
  };

  const service = {
    state,

    commit: mock(async (messageId: string): Promise<void> => {
      state.commits.push(messageId);
      const outcome = state.commitOutcomes.length
        ? (state.commitOutcomes.shift() as 'ok' | 'duplicate' | 'fail')
        : 'ok';

      if (state.commitError) throw state.commitError;
      if (outcome === 'fail') throw new Error('the inbox marker could not be written');

      if (outcome === 'duplicate' || state.markers.has(messageId)) {
        throw Object.assign(
          new Error('E11000 duplicate key error collection: inboxconsumermessages index: messageId_1'),
          { code: 11000 },
        );
      }

      state.markers.add(messageId);
    }),

    isCommitted: mock(async (messageId: string): Promise<boolean> => {
      state.reads.push(messageId);
      if (state.readError) throw state.readError;

      return state.markers.has(messageId) || state.preexisting.has(messageId);
    }),
  };

  return service;
}

export type FakeConsumerService = ReturnType<typeof createFakeConsumerService>;

export function asConsumerService(fake: FakeConsumerService): InboxConsumerService {
  return fake as unknown as InboxConsumerService;
}
