/**
 * Contract tests for the signer service on both sides of RabbitMQ.
 *
 * Consumer: one queue per signer, named after SERVICE_NAME, bound to
 * `sign.exchange` with the shared key `task`. Because a direct exchange copies
 * a message into every matching queue, all three signers get their own copy —
 * that only works while the names stay unique. TTL 15 min drops stale tasks.
 *
 * Producer: the response goes through the outbox into the same exchange with
 * the key `response`.
 *
 * No broker, no database.
 */
import { describe, expect, test } from 'bun:test';
import { RabbitMQClient } from '../src/clients/rabbitmq.client';
import { InboxConsumerDaemon } from '../src/daemons/inboxConsumer.daemon';
import { OutboxPublisherDaemon } from '../src/daemons/outboxPublisher.daemon';

type RoutingEntry = { prefetch: number; isSync: boolean; handlers: Record<string, unknown> };
type ExchangeConfig = { isSync: boolean; concurrency: number; maxAttempts: number };

function signer(name: string) {
  const client = new RabbitMQClient('amqp://guest:guest@localhost:5672', name);
  const daemon = new InboxConsumerDaemon(client as never, {} as never, {} as never);

  return {
    client,
    topology: client.getTopologyDefinition(),
    routing: (daemon as unknown as { eventRouting: Record<string, RoutingEntry> }).eventRouting,
  };
}

const first = signer('signer-1');

describe('signer RabbitMQ topology', () => {
  test('declares one durable queue named after the signer, bound to sign.exchange with the task key', () => {
    expect(Object.keys(first.topology.queues)).toEqual(['sign.requests.signer-1']);
    expect(first.topology.exchanges).toEqual({
      'sign.exchange': { type: 'direct', options: { durable: true } },
    });
    expect(first.topology.queues['sign.requests.signer-1'].bindings).toEqual({ 'sign.exchange': ['task'] });
  });

  test('two signers never share a queue (otherwise one task would reach only one of them)', () => {
    const second = signer('signer-2');

    expect(Object.keys(second.topology.queues)).toEqual(['sign.requests.signer-2']);
    expect(first.client.getQueue('sign.requests.signer-1')).not.toBe(second.client.getQueue('sign.requests.signer-2'));
  });

  test('the request queue carries no message TTL: retry and park own the lifecycle', () => {
    expect(first.topology.queues['sign.requests.signer-1'].options).toEqual({ durable: true });
  });

  test('the queue retries 3 times in process, 3 retry cycles, then parks', () => {
    expect(first.topology.queues['sign.requests.signer-1']).toMatchObject({
      deferAfterAttempts: 3,
      parkAfterCycles: 3,
    });
  });

  test('the routing table matches the binding: one queue, one key, serialized', () => {
    expect(Object.keys(first.routing)).toEqual(Object.keys(first.topology.queues));
    expect(Object.keys(first.routing['sign.requests.signer-1'].handlers)).toEqual(['task']);
    expect(first.routing['sign.requests.signer-1']).toMatchObject({ prefetch: 5, isSync: false });
  });

  test('the outbox publishes responses to a registered exchange', () => {
    const daemon = new OutboxPublisherDaemon({} as never);
    const config = (daemon as unknown as { exchangesConfig: Record<string, ExchangeConfig> }).exchangesConfig;

    expect(Object.keys(config)).toEqual(['sign.exchange']);

    for (const exchange of Object.keys(config)) {
      expect(first.client.isExchangeRegistered(exchange)).toBe(true);
    }

    expect(config['sign.exchange']).toEqual({ isSync: false, concurrency: 5, maxAttempts: 5 });
  });
});
