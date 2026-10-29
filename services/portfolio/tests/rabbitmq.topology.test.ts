/**
 * Contract test for the portfolio service: bindings, queue policy and the
 * inbox routing table must describe the same set of events. No broker, no
 * database.
 */
import { describe, expect, test } from 'bun:test';
import { RabbitMQClient } from '../src/clients/rabbitmq.client';
import { InboxConsumerDaemon } from '../src/daemons/inboxConsumer.daemon';

type RoutingEntry = { prefetch: number; isSync: boolean; handlers: Record<string, unknown> };

const client = new RabbitMQClient('amqp://guest:guest@localhost:5672', ['97']);
const topology = client.getTopologyDefinition();
const daemon = new InboxConsumerDaemon(client as never, {} as never, {} as never);
const routing = (daemon as unknown as { eventRouting: Record<string, RoutingEntry> }).eventRouting;

describe('portfolio RabbitMQ topology', () => {
  test('consumes a single queue of the blockchain events exchange', () => {
    expect(Object.keys(topology.queues)).toEqual(['blockchain.97.events.portfolio']);
    expect(topology.exchanges).toEqual({
      'blockchain.97.events': {
        type: 'direct',
        options: { durable: true },
        allowUnrouted: true,
      },
    });
  });

  test('binds only RWA_Transfer and routes only RWA_Transfer', () => {
    expect(topology.queues['blockchain.97.events.portfolio'].bindings).toEqual({
      'blockchain.97.events': ['RWA_Transfer'],
    });
    expect(Object.keys(routing['blockchain.97.events.portfolio'].handlers)).toEqual(['RWA_Transfer']);
  });

  test('the queue is serialized: balance rows are read-modify-write', () => {
    expect(routing['blockchain.97.events.portfolio']).toMatchObject({ prefetch: 1, isSync: true });
  });

  test('the retry policy is infinite: no retry queue, no parked queue', () => {
    expect(topology.queues['blockchain.97.events.portfolio']).toMatchObject({
      deferAfterAttempts: Number.POSITIVE_INFINITY,
      parkAfterCycles: Number.POSITIVE_INFINITY,
    });
  });
});
