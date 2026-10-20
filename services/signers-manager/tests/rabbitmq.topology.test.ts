/**
 * Contract tests for the signers-manager service on both sides of RabbitMQ.
 *
 * Consumer: `sign.responses`, bound to `sign.exchange` with the key `response`,
 * one hour TTL (a response older than the task itself is useless).
 * Producer: the same exchange, key `task`, one copy per signer queue.
 *
 * No broker, no database.
 */
import { describe, expect, test } from 'bun:test';
import { RabbitMQClient } from '../src/clients/rabbitmq.client';
import { InboxConsumerDaemon } from '../src/daemons/inboxConsumer.daemon';
import { OutboxPublisherDaemon } from '../src/daemons/outboxPublisher.daemon';

type RoutingEntry = { prefetch: number; isSync: boolean; handlers: Record<string, unknown> };
type ExchangeConfig = { isSync: boolean; concurrency: number; maxAttempts: number };

const client = new RabbitMQClient('amqp://guest:guest@localhost:5672');
const topology = client.getTopologyDefinition();
const daemon = new InboxConsumerDaemon(client as never, {} as never, {} as never);
const routing = (daemon as unknown as { eventRouting: Record<string, RoutingEntry> }).eventRouting;

describe('signers-manager RabbitMQ topology', () => {
  test('declares the responses queue and the shared signing exchange', () => {
    expect(Object.keys(topology.queues)).toEqual(['sign.responses']);
    expect(topology.exchanges).toEqual({
      'sign.exchange': { type: 'direct', options: { durable: true } },
    });
    expect(topology.queues['sign.responses'].bindings).toEqual({ 'sign.exchange': ['response'] });
  });

  test('the responses queue carries a one-hour TTL', () => {
    expect(topology.queues['sign.responses'].options).toEqual({
      durable: true,
      arguments: { 'x-message-ttl': 3_600_000 },
    });
  });

  test('the queue retries 3 times in process, 3 retry cycles, then parks', () => {
    expect(topology.queues['sign.responses']).toMatchObject({ deferAfterAttempts: 3, parkAfterCycles: 3 });
  });

  test('the routing table matches the binding: one queue, one key, serialized', () => {
    expect(Object.keys(routing)).toEqual(Object.keys(topology.queues));
    expect(Object.keys(routing['sign.responses'].handlers)).toEqual(['response']);
    expect(routing['sign.responses']).toMatchObject({ prefetch: 1, isSync: true });
  });

  test('the outbox publishes tasks to a registered exchange', () => {
    const outbox = new OutboxPublisherDaemon({} as never);
    const config = (outbox as unknown as { exchangesConfig: Record<string, ExchangeConfig> }).exchangesConfig;

    expect(Object.keys(config)).toEqual(['sign.exchange']);

    for (const exchange of Object.keys(config)) {
      expect(client.isExchangeRegistered(exchange)).toBe(true);
    }

    expect(config['sign.exchange']).toEqual({ isSync: false, concurrency: 5, maxAttempts: 5 });
  });
});
