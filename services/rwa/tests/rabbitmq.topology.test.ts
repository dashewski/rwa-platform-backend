/**
 * Contract tests for the rwa service as a RabbitMQ participant.
 *
 * Two things must agree, and today nothing checks it: the topology the client
 * declares for the broker (queues, bindings, retry policy) and the routing
 * table the inbox daemon uses to dispatch events. A binding without a handler
 * is dead weight; a handler without a binding is a silent drop — the event is
 * published with mandatory=true, returned by the broker and (for the scanner's
 * infinite-policy outbox) freezes the whole stream.
 *
 * No broker and no database: the client only computes its topology, the daemon
 * is constructed with empty doubles and its routing table is read back.
 */
import { describe, expect, test } from 'bun:test';
import { RabbitMQClient } from '../src/clients/rabbitmq.client';
import { InboxConsumerDaemon } from '../src/daemons/inboxConsumer.daemon';

type RoutingEntry = { prefetch: number; isSync: boolean; handlers: Record<string, unknown> };

const client = new RabbitMQClient('amqp://guest:guest@localhost:5672');
const topology = client.getTopologyDefinition();
const daemon = new InboxConsumerDaemon(client as never, {} as never, {} as never, {} as never);
const routing = (daemon as unknown as { eventRouting: Record<string, RoutingEntry> }).eventRouting;

describe('rwa RabbitMQ topology', () => {
  test('declares exactly the two queues it consumes', () => {
    expect(Object.keys(topology.queues).sort()).toEqual(['blockchain.events.rwa', 'evaluation.results']);
  });

  test('declares both exchanges as durable direct exchanges', () => {
    expect(topology.exchanges).toEqual({
      'blockchain.events': { type: 'direct', options: { durable: true } },
      evaluation: { type: 'direct', options: { durable: true } },
    });
  });

  test('every routed event is bound and nothing else is bound', () => {
    for (const queueName of Object.keys(routing)) {
      const handlers = Object.keys(routing[queueName].handlers).sort();
      const bindings = Object.entries(topology.queues[queueName].bindings)
        .flatMap(([, routingKeys]) => [...(routingKeys as readonly string[])])
        .sort();

      expect(bindings).toEqual(handlers);
    }
  });

  test('the inbox routing table covers exactly the consumed queues', () => {
    expect(Object.keys(routing).sort()).toEqual(Object.keys(topology.queues).sort());
  });

  test('both queues are serialized (prefetch 1, isSync)', () => {
    expect(routing['blockchain.events.rwa']).toMatchObject({ prefetch: 1, isSync: true });
    expect(routing['evaluation.results']).toMatchObject({ prefetch: 1, isSync: true });
  });

  test('blockchain events retry forever; evaluation results retry 3 times then park', () => {
    expect(topology.queues['blockchain.events.rwa']).toMatchObject({
      deferAfterAttempts: Number.POSITIVE_INFINITY,
      parkAfterCycles: Number.POSITIVE_INFINITY,
    });
    expect(topology.queues['evaluation.results']).toMatchObject({
      deferAfterAttempts: 3,
      parkAfterCycles: 3,
    });
  });

  test('evaluation results are routed by the two keys the evaluator publishes', () => {
    expect(topology.queues['evaluation.results'].bindings).toEqual({
      evaluation: ['poolResult', 'businessResult'],
    });
  });

  test('the blockchain queue binds the 13 events the scanner can emit for it', () => {
    expect(topology.queues['blockchain.events.rwa'].bindings['blockchain.events']).toEqual([
      'RWA_Deployed',
      'RWA_PausedStateChanged',
      'Pool_Deployed',
      'Pool_BonusWithdrawn',
      'Pool_AwaitingRwaAmountUpdated',
      'Pool_FundsFullyReturned',
      'Pool_IncomingReturnSummary',
      'Pool_IncomingTrancheUpdate',
      'Pool_OutgoingClaimSummary',
      'Pool_OutgoingTrancheClaimed',
      'Pool_PausedStateChanged',
      'Pool_ReservesUpdated',
      'Pool_TargetReached',
    ]);
  });
});
