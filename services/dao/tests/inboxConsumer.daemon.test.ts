/**
 * Unit tests for the dao InboxConsumerDaemon — routing only.
 *
 * The daemon extends the shared BaseInboxConsumerDaemon: it declares the
 * `blockchain.events.dao` queue, the prefetch and the routing table that maps
 * every DAO event name onto a DaoService method. The RabbitMQ client and the
 * consumer service are fakes, DaoService is a fake: these tests need no
 * database, no broker and no network. What is pinned down: which queue the
 * daemon subscribes to, that every event name reaches exactly its own service
 * method with the decoded payload, and that failures / malformed payloads are
 * not swallowed by the daemon.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { ConsumeMessage } from 'amqplib';
import { InboxConsumerDaemon } from '../src/daemons/inboxConsumer.daemon';
import type { RabbitMQClient } from '../src/clients/rabbitmq.client';
import type { InboxConsumerService } from '@shared/inbox-consumer';
import type { DaoService } from '../src/services/dao.service';
import { createFakeDaoService, type FakeDaoService } from './fakes/dao.service.fake';

const QUEUE = 'blockchain.events.dao';

const ROUTING: Array<[string, keyof FakeDaoService]> = [
  ['Governance_ProposalCreated', 'processProposalCreated'],
  ['Governance_ProposalExecuted', 'processProposalExecuted'],
  ['Governance_ProposalCancelled', 'processProposalCancelled'],
  ['Governance_VoteCast', 'processVoteCast'],
  ['DaoStaking_TokensStaked', 'processTokensStaked'],
  ['DaoStaking_TokensUnstaked', 'processTokensUnstaked'],
  ['DaoStaking_TokensLocked', 'processTokensLocked'],
  ['Timelock_TransactionQueued', 'processTransactionQueued'],
  ['Timelock_TransactionExecuted', 'processTransactionExecuted'],
  ['Timelock_TransactionCancelled', 'processTransactionCancelled'],
  ['Treasury_Withdrawal', 'processTreasuryWithdrawal'],
];

function makeEvent(name: string) {
  return {
    chainId: '31337',
    name,
    blockNumber: 42,
    transactionHash: '0xtx1',
    address: '0xGovernance',
    logIndex: 0,
    data: { emittedFrom: '0xGovernance', proposalId: '7', voter: '0xCarol', support: true, weight: '123' },
    timestamp: 1_700_000_000,
  };
}

function makeMessage(routingKey: string, body: unknown, options: { raw?: string } = {}): ConsumeMessage {
  return {
    content: Buffer.from(options.raw ?? JSON.stringify(body)),
    fields: { routingKey, redelivered: false, deliveryTag: 1, exchange: 'blockchain.events', consumerTag: 'ctag' },
    properties: { messageId: '31337:0xtx1:0' },
  } as unknown as ConsumeMessage;
}

/** RabbitMQ client stub: keeps the callback consume() was given. */
function createFakeRabbitClient() {
  const state = {
    consumed: [] as Array<{ queue: string; options: unknown }>,
    acked: [] as ConsumeMessage[],
    nacked: [] as Array<{ message: ConsumeMessage; requeue: boolean }>,
    cancelled: [] as string[],
    connected: true,
    handler: null as null | ((message: ConsumeMessage | null) => Promise<void>),
  };

  const client = {
    state,

    consume: mock(async (queue: string, handler: (message: ConsumeMessage | null) => Promise<void>, options: unknown) => {
      state.consumed.push({ queue, options });
      state.handler = handler;
      return `ctag-${state.consumed.length}`;
    }),

    cancelConsumer: mock(async (consumerTag: string) => {
      state.cancelled.push(consumerTag);
    }),

    ack: mock(async (message: ConsumeMessage) => {
      state.acked.push(message);
    }),

    nack: mock(async (message: ConsumeMessage, requeue = true) => {
      state.nacked.push({ message, requeue });
    }),

    isConnected: mock(() => state.connected),
  };

  return client;
}

/**
 * Consumer service stub: runs the delivery callback exactly like the real
 * service does inside its dedup transaction and reports the outcome the test
 * asked for.
 */
function createFakeConsumerService() {
  const state = {
    outcome: 'acked' as 'acked' | 'halted',
    statuses: new Map<string, 'running' | 'halted'>(),
    handlerError: null as unknown,
    deliveries: 0,
  };

  const service = {
    state,

    handle: mock(async (queueName: string, _message: ConsumeMessage, handler: () => Promise<void>) => {
      state.deliveries += 1;

      try {
        await handler();
      } catch (error) {
        state.handlerError = error;
      }

      state.statuses.set(queueName, state.outcome === 'halted' ? 'halted' : 'running');
      return state.outcome;
    }),

    status: mock((queueName: string) => state.statuses.get(queueName) ?? 'running'),

    markProbed: mock((queueName: string) => {
      state.statuses.set(queueName, 'running');
    }),
  };

  return service;
}

describe('dao InboxConsumerDaemon (unit, fakes for client / consumer service / DaoService)', () => {
  let rabbit: ReturnType<typeof createFakeRabbitClient>;
  let consumerService: ReturnType<typeof createFakeConsumerService>;
  let daoService: FakeDaoService;
  let daemon: InboxConsumerDaemon;

  beforeEach(() => {
    rabbit = createFakeRabbitClient();
    consumerService = createFakeConsumerService();
    daoService = createFakeDaoService();
    daemon = new InboxConsumerDaemon(
      rabbit as unknown as RabbitMQClient,
      consumerService as unknown as InboxConsumerService,
      daoService as unknown as DaoService,
    );
  });

  async function deliver(routingKey: string, message: ConsumeMessage): Promise<void> {
    if (!rabbit.state.handler) throw new Error('the daemon never subscribed');
    await rabbit.state.handler(message);
  }

  test('subscribes only to the dao queue, with prefetch 1', async () => {
    await daemon.initialize();

    expect(rabbit.state.consumed).toEqual([{ queue: QUEUE, options: { prefetch: 1 } }]);
  });

  test('every DAO event name is routed to its own service method, exactly once', async () => {
    await daemon.initialize();

    for (const [eventName, method] of ROUTING) {
      const event = makeEvent(eventName);
      await deliver(eventName, makeMessage(eventName, event));

      expect(daoService[method]).toHaveBeenCalledTimes(1);
      expect(daoService[method]).toHaveBeenCalledWith(event);
    }

    // The routing table covers the full DAO surface: 11 events, 11 service calls.
    expect(Object.keys(daoService)).toHaveLength(ROUTING.length);
    const totalCalls = Object.values(daoService).reduce((sum, method) => sum + method.mock.calls.length, 0);
    expect(totalCalls).toBe(ROUTING.length);
    expect(rabbit.state.acked).toHaveLength(ROUTING.length);
  });

  test('the payload reaches the service exactly as it was published (no transformation)', async () => {
    await daemon.initialize();
    const event = makeEvent('Governance_VoteCast');

    await deliver('Governance_VoteCast', makeMessage('Governance_VoteCast', event));

    const forwarded = daoService.processVoteCast.mock.calls[0][0] as typeof event;
    expect(forwarded).toEqual(event);
    expect(forwarded.data).toEqual(event.data);
    expect(forwarded.chainId).toBe('31337');
  });

  test('an event of another service (unknown routing key) never reaches the DAO service', async () => {
    await daemon.initialize();

    await deliver('RWA_Deployed', makeMessage('RWA_Deployed', { entityId: 'business-1' }));

    const totalCalls = Object.values(daoService).reduce((sum, method) => sum + method.mock.calls.length, 0);
    expect(totalCalls).toBe(0);
    // The message is acked and dropped by the current daemon behaviour.
    expect(rabbit.state.acked).toHaveLength(1);
  });

  test('a service failure is not swallowed: the delivery is halted and the message requeued', async () => {
    await daemon.initialize();
    consumerService.state.outcome = 'halted';
    daoService.processTokensStaked.mockRejectedValueOnce(new Error('db is down'));

    await deliver('DaoStaking_TokensStaked', makeMessage('DaoStaking_TokensStaked', makeEvent('DaoStaking_TokensStaked')));

    expect(consumerService.state.handlerError).toBeInstanceOf(Error);
    expect((consumerService.state.handlerError as Error).message).toBe('db is down');
    expect(rabbit.state.nacked).toHaveLength(1);
    expect(rabbit.state.nacked[0].requeue).toBe(true);
    expect(rabbit.state.acked).toHaveLength(0);
    expect(rabbit.state.cancelled).toEqual(['ctag-1']);
  });

  test('a malformed payload fails the delivery instead of silently dropping the event', async () => {
    await daemon.initialize();
    consumerService.state.outcome = 'halted';

    await deliver('Governance_VoteCast', makeMessage('Governance_VoteCast', {}, { raw: '{"proposalId":' }));

    expect(daoService.processVoteCast).toHaveBeenCalledTimes(0);
    expect(consumerService.state.handlerError).toBeInstanceOf(Error);
    expect((consumerService.state.handlerError as Error).message).toContain('not valid JSON');
    expect(rabbit.state.nacked).toHaveLength(1);
  });

  test('a successful delivery is acked and nothing is requeued', async () => {
    await daemon.initialize();

    await deliver('Treasury_Withdrawal', makeMessage('Treasury_Withdrawal', makeEvent('Treasury_Withdrawal')));

    expect(daoService.processTreasuryWithdrawal).toHaveBeenCalledTimes(1);
    expect(rabbit.state.acked).toHaveLength(1);
    expect(rabbit.state.nacked).toHaveLength(0);
    expect(rabbit.state.cancelled).toEqual([]);
  });

  test('stop cancels the consumer while the connection is alive', async () => {
    await daemon.initialize();

    await daemon.stop();

    expect(rabbit.state.cancelled).toEqual(['ctag-1']);
  });

  test('stop without a connection cancels nothing', async () => {
    await daemon.initialize();
    rabbit.state.connected = false;

    await daemon.stop();

    expect(rabbit.state.cancelled).toEqual([]);
  });
});
