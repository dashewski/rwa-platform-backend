/**
 * Contract test for the loyalty service: bindings, queue policy and the inbox
 * routing table must describe the same set of events. No broker, no database.
 */
import { describe, expect, test } from 'bun:test';
import { RabbitMQClient } from '../src/clients/rabbitmq.client';
import { InboxConsumerDaemon } from '../src/daemons/inboxConsumer.daemon';

type RoutingEntry = { prefetch: number; isSync: boolean; handlers: Record<string, unknown> };

const client = new RabbitMQClient('amqp://guest:guest@localhost:5672');
const topology = client.getTopologyDefinition();
const daemon = new InboxConsumerDaemon(client as never, {} as never, {} as never);
const routing = (daemon as unknown as { eventRouting: Record<string, RoutingEntry> }).eventRouting;

describe('loyalty RabbitMQ topology', () => {
  test('consumes a single queue of the blockchain events exchange', () => {
    expect(Object.keys(topology.queues)).toEqual(['blockchain.events.loyalty']);
    expect(topology.exchanges).toEqual({
      'blockchain.events': {
        type: 'direct',
        options: { durable: true },
        allowUnrouted: true,
      },
    });
  });

  test('every routed event is bound and nothing else is bound', () => {
    const bindings = [...topology.queues['blockchain.events.loyalty'].bindings['blockchain.events']].sort();

    expect(bindings as string[]).toEqual(Object.keys(routing['blockchain.events.loyalty'].handlers).sort());
    expect(bindings).toEqual([
      'Factory_CreatePoolFeeCollected',
      'Factory_CreateRWAFeeCollected',
      'Pool_RwaBurned',
      'Pool_RwaMinted',
      'ReferralTreasury_Withdrawn',
    ]);
  });

  test('the queue is serialized and retries forever', () => {
    expect(routing['blockchain.events.loyalty']).toMatchObject({ prefetch: 1, isSync: true });
    expect(topology.queues['blockchain.events.loyalty']).toMatchObject({
      deferAfterAttempts: Number.POSITIVE_INFINITY,
      parkAfterCycles: Number.POSITIVE_INFINITY,
    });
  });
});
