/**
 * Contract test for the dao service: bindings, queue policy and the inbox
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

describe('dao RabbitMQ topology', () => {
  test('consumes a single queue of the blockchain events exchange', () => {
    expect(Object.keys(topology.queues)).toEqual(['blockchain.events.dao']);
    expect(topology.exchanges).toEqual({
      'blockchain.events': { type: 'direct', options: { durable: true } },
    });
  });

  test('every routed event is bound and nothing else is bound', () => {
    const bindings = [...topology.queues['blockchain.events.dao'].bindings['blockchain.events']].sort();

    expect(bindings as string[]).toEqual(Object.keys(routing['blockchain.events.dao'].handlers).sort());
  });

  test('the queue binds exactly the 11 governance/staking/timelock/treasury events', () => {
    expect(topology.queues['blockchain.events.dao'].bindings['blockchain.events']).toEqual([
      'Governance_ProposalCreated',
      'Governance_ProposalExecuted',
      'Governance_ProposalCancelled',
      'Governance_VoteCast',
      'DaoStaking_TokensStaked',
      'DaoStaking_TokensUnstaked',
      'DaoStaking_TokensLocked',
      'Timelock_TransactionQueued',
      'Timelock_TransactionExecuted',
      'Timelock_TransactionCancelled',
      'Treasury_Withdrawal',
    ]);
  });

  test('the queue is serialized and retries forever', () => {
    expect(routing['blockchain.events.dao']).toMatchObject({ prefetch: 1, isSync: true });
    expect(topology.queues['blockchain.events.dao']).toMatchObject({
      deferAfterAttempts: Number.POSITIVE_INFINITY,
      parkAfterCycles: Number.POSITIVE_INFINITY,
    });
  });
});
