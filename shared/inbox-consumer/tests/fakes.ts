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
  options: { messageId?: string | null; redelivered?: boolean; raw?: string } = {},
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
    },
  } as unknown as ConsumeMessage;
}

/**
 * Stand-in for BaseRabbitMQClient: records consumer registrations, the ack /
 * nack / cancel calls and lets a test make any of them fail.
 */
export function createFakeRabbitClient() {
  const state = {
    connected: true,
    consumerTags: [] as string[],
    acked: [] as ConsumeMessage[],
    nacked: [] as Array<{ message: ConsumeMessage; requeue: boolean }>,
    cancelled: [] as string[],
    handlers: new Map<string, (message: ConsumeMessage | null) => Promise<void>>(),
    consumedOptions: [] as Array<{ queue: string; options: unknown }>,
    failConsumeFor: null as string | null,
    failCancel: null as Error | null,
    failAck: null as Error | null,
    failNack: null as Error | null,
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

    isConnected: mock((): boolean => state.connected),
  };

  return client;
}

export type FakeRabbitClient = ReturnType<typeof createFakeRabbitClient>;

export function asRabbitClient(fake: FakeRabbitClient): BaseRabbitMQClient {
  return fake as unknown as BaseRabbitMQClient;
}

/**
 * Stand-in for InboxConsumerService. Unlike the real service it does not run
 * attempts itself: the test decides the outcome of a delivery, so the daemon's
 * ack / halt / probe wiring can be asserted in isolation. When `runHandler` is
 * true the fake invokes the delivery callback exactly like the real service
 * does (inside its dedup transaction), which is how the JSON-parse and
 * unknown-routing-key paths are exercised.
 */
export function createFakeConsumerService() {
  const state = {
    nextOutcome: 'acked' as 'acked' | 'halted',
    outcomes: [] as Array<'acked' | 'halted'>,
    statuses: new Map<string, 'running' | 'halted'>(),
    handles: [] as Array<{ queueName: string; message: ConsumeMessage }>,
    probed: [] as string[],
    runHandler: true,
    handlerError: null as unknown,
  };

  const service = {
    state,

    handle: mock(
      async (
        queueName: string,
        message: ConsumeMessage,
        handler: () => Promise<void>,
      ): Promise<'acked' | 'halted'> => {
        state.handles.push({ queueName, message });

        if (state.runHandler) {
          try {
            await handler();
          } catch (error) {
            state.handlerError = error;
          }
        }

        const outcome = state.outcomes.length ? (state.outcomes.shift() as 'acked' | 'halted') : state.nextOutcome;
        state.statuses.set(queueName, outcome === 'halted' ? 'halted' : 'running');

        return outcome;
      },
    ),

    status: mock((queueName: string): 'running' | 'halted' => state.statuses.get(queueName) ?? 'running'),

    markProbed: mock((queueName: string): void => {
      state.probed.push(queueName);
      state.statuses.set(queueName, 'running');
    }),
  };

  return service;
}

export type FakeConsumerService = ReturnType<typeof createFakeConsumerService>;

export function asConsumerService(fake: FakeConsumerService): InboxConsumerService {
  return fake as unknown as InboxConsumerService;
}
