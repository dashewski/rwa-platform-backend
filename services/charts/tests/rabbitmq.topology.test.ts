/**
 * Contract test for the charts service: the queue it consumes, the events it
 * binds and the routing table of its inbox daemon must describe the same set.
 * No broker, no database — the client only computes its topology.
 */
import { describe, expect, test } from 'bun:test';
import { RabbitMQClient } from '../src/clients/rabbitmq.client';
import { InboxConsumerDaemon } from '../src/daemons/inboxConsumer.daemon';

type RoutingEntry = { prefetch: number; isSync: boolean; handlers: Record<string, unknown> };

const client = new RabbitMQClient('amqp://guest:guest@localhost:5672', ['97']);
const topology = client.getTopologyDefinition();
const daemon = new InboxConsumerDaemon(client as never, {} as never, {} as never, {} as never);
const routing = (daemon as unknown as { eventRouting: Record<string, RoutingEntry> }).eventRouting;

describe('charts RabbitMQ topology', () => {
  test('consumes a single queue of the blockchain events exchange', () => {
    expect(Object.keys(topology.queues)).toEqual(['blockchain.97.events.charts']);
    expect(topology.exchanges).toEqual({
      'blockchain.97.events': {
        type: 'direct',
        options: { durable: true },
        allowUnrouted: true,
      },
    });
  });

  test('every routed event is bound and nothing else is bound', () => {
    const bindings = [...topology.queues['blockchain.97.events.charts'].bindings['blockchain.97.events']].sort();

    expect(bindings as string[]).toEqual(Object.keys(routing['blockchain.97.events.charts'].handlers).sort());
    expect(bindings).toEqual(['Pool_ReservesUpdated', 'Pool_RwaBurned', 'Pool_RwaMinted']);
  });

  test('the queue is serialized: price rows must be written in event order', () => {
    expect(routing['blockchain.97.events.charts']).toMatchObject({ prefetch: 1, isSync: true });
  });

  test('the retry policy is infinite: no retry queue, no parked queue', () => {
    expect(topology.queues['blockchain.97.events.charts']).toMatchObject({
      deferAfterAttempts: Number.POSITIVE_INFINITY,
      parkAfterCycles: Number.POSITIVE_INFINITY,
    });
  });
});
