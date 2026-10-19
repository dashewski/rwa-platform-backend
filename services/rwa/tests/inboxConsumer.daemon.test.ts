/**
 * Unit tests for the rwa InboxConsumerDaemon — routing only.
 *
 * The daemon extends the shared BaseInboxConsumerDaemon and declares two
 * queues: `blockchain.events.rwa` (13 chain events onto BusinessService /
 * PoolService) and `evaluation.results` (the result the ai-evaluator service
 * sends back). The RabbitMQ client, the consumer service and both services are
 * fakes: no database, no broker, no network.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { ConsumeMessage } from 'amqplib';
import { InboxConsumerDaemon } from '../src/daemons/inboxConsumer.daemon';
import type { RabbitMQClient } from '../src/clients/rabbitmq.client';
import type { InboxConsumerService } from '@shared/inbox-consumer';
import type { BusinessService } from '../src/services/business.service';
import type { PoolService } from '../src/services/pool.service';
import { createFakeBusinessService, type FakeBusinessService } from './fakes/business.service.fake';
import { createFakePoolService, type FakePoolService } from './fakes/pool.service.fake';

const BLOCKCHAIN_QUEUE = 'blockchain.events.rwa';
const RESULTS_QUEUE = 'evaluation.results';

const ROUTING: Array<[string, keyof FakeBusinessService | keyof FakePoolService, 'business' | 'pool']> = [
  ['RWA_Deployed', 'syncAfterDeployment', 'business'],
  ['RWA_PausedStateChanged', 'syncPausedState', 'business'],
  ['Pool_Deployed', 'syncPoolAfterDeployment', 'pool'],
  ['Pool_BonusWithdrawn', 'syncPoolBonusWithdrawn', 'pool'],
  ['Pool_AwaitingRwaAmountUpdated', 'syncPoolAwaitingRwaAmount', 'pool'],
  ['Pool_FundsFullyReturned', 'syncPoolFundsFullyReturned', 'pool'],
  ['Pool_IncomingReturnSummary', 'syncPoolIncomingReturnSummary', 'pool'],
  ['Pool_IncomingTrancheUpdate', 'syncPoolIncomingTrancheUpdate', 'pool'],
  ['Pool_OutgoingClaimSummary', 'syncPoolOutgoingClaimSummary', 'pool'],
  ['Pool_OutgoingTrancheClaimed', 'syncPoolOutgoingTrancheClaimed', 'pool'],
  ['Pool_PausedStateChanged', 'syncPoolPausedState', 'pool'],
  ['Pool_ReservesUpdated', 'syncPoolReserves', 'pool'],
  ['Pool_TargetReached', 'syncPoolTargetReached', 'pool'],
];

function makeStockEvent(name: string) {
  return {
    chainId: '97',
    name,
    blockNumber: 42,
    transactionHash: '0xtx1',
    address: '0xPool',
    logIndex: 0,
    data: { emittedFrom: '0xPool', isPaused: true },
    timestamp: 1_700_000_000,
  };
}

function makeResult(overrides: Record<string, unknown> = {}) {
  return {
    evaluationId: 'eval-1',
    entityType: 'pool',
    entityId: 'pool-1',
    status: 'completed',
    riskScore: 42,
    ...overrides,
  };
}

function makeMessage(
  routingKey: string,
  body: unknown,
  options: { raw?: string; exchange?: string } = {},
): ConsumeMessage {
  return {
    content: Buffer.from(options.raw ?? JSON.stringify(body)),
    fields: {
      routingKey,
      redelivered: false,
      deliveryTag: 1,
      exchange: options.exchange ?? 'blockchain.events',
      consumerTag: 'ctag',
    },
    properties: { messageId: '97:0xtx1:0' },
  } as unknown as ConsumeMessage;
}

/** RabbitMQ client stub: keeps the callback consume() was given, per queue. */
function createFakeRabbitClient() {
  const state = {
    consumed: [] as Array<{ queue: string; options: unknown }>,
    acked: [] as ConsumeMessage[],
    nacked: [] as Array<{ message: ConsumeMessage; requeue: boolean }>,
    cancelled: [] as string[],
    connected: true,
    handlers: new Map<string, (message: ConsumeMessage | null) => Promise<void>>(),
  };

  const client = {
    state,

    consume: mock(
      async (queue: string, handler: (message: ConsumeMessage | null) => Promise<void>, options: unknown) => {
        state.consumed.push({ queue, options });
        state.handlers.set(queue, handler);
        return `ctag-${queue}`;
      },
    ),

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

describe('rwa InboxConsumerDaemon (unit, fakes for client / consumer service / services)', () => {
  let rabbit: ReturnType<typeof createFakeRabbitClient>;
  let consumerService: ReturnType<typeof createFakeConsumerService>;
  let businessService: FakeBusinessService;
  let poolService: FakePoolService;
  let daemon: InboxConsumerDaemon;

  beforeEach(() => {
    rabbit = createFakeRabbitClient();
    consumerService = createFakeConsumerService();
    businessService = createFakeBusinessService();
    poolService = createFakePoolService();
    daemon = new InboxConsumerDaemon(
      rabbit as unknown as RabbitMQClient,
      consumerService as unknown as InboxConsumerService,
      businessService as unknown as BusinessService,
      poolService as unknown as PoolService,
    );
  });

  async function deliver(queue: string, routingKey: string, message: ConsumeMessage): Promise<void> {
    const handler = rabbit.state.handlers.get(queue);
    if (!handler) throw new Error(`the daemon never subscribed to ${queue}`);
    await handler(message);
  }

  test('subscribes to both queues, with prefetch 1', async () => {
    await daemon.initialize();

    expect(rabbit.state.consumed).toEqual([
      { queue: BLOCKCHAIN_QUEUE, options: { prefetch: 1 } },
      { queue: RESULTS_QUEUE, options: { prefetch: 1 } },
    ]);
  });

  test('every blockchain event name reaches its own service method, exactly once', async () => {
    await daemon.initialize();

    for (const [eventName, method, target] of ROUTING) {
      const event = makeStockEvent(eventName);
      await deliver(BLOCKCHAIN_QUEUE, eventName, makeMessage(eventName, event));

      const service = (target === 'business' ? businessService : poolService) as Record<string, ReturnType<typeof mock>>;
      expect(service[method as string]).toHaveBeenCalledTimes(1);
      expect(service[method as string]).toHaveBeenCalledWith(event);
    }

    // The routing table covers the whole chain surface: 13 events, 13 calls.
    expect(Object.keys(businessService)).toHaveLength(5);
    expect(Object.keys(poolService)).toHaveLength(14);
  });

  test('a blockchain event is delivered as-is: envelope plus data, nothing flattened', async () => {
    await daemon.initialize();

    const event = makeStockEvent('Pool_ReservesUpdated');
    await deliver(BLOCKCHAIN_QUEUE, 'Pool_ReservesUpdated', makeMessage('Pool_ReservesUpdated', event));

    const [forwarded] = poolService.syncPoolReserves.mock.calls[0];
    expect(forwarded).toEqual(event);
    expect(forwarded.chainId).toBe('97');
    expect(forwarded.data).toEqual({ emittedFrom: '0xPool', isPaused: true });
    expect(rabbit.state.acked).toHaveLength(1);
    expect(rabbit.state.nacked).toEqual([]);
  });

  test('an unknown blockchain routing key is acked without touching any service', async () => {
    await daemon.initialize();

    await deliver(BLOCKCHAIN_QUEUE, 'Governance_VoteCast', makeMessage('Governance_VoteCast', makeStockEvent('Governance_VoteCast')));

    expect(poolService.syncPoolReserves).toHaveBeenCalledTimes(0);
    expect(businessService.syncAfterDeployment).toHaveBeenCalledTimes(0);
    expect(rabbit.state.acked).toHaveLength(1);
  });

  test('the poolResult key hands the payload to the pool service as-is', async () => {
    await daemon.initialize();

    const result = makeResult();
    await deliver(RESULTS_QUEUE, 'poolResult', makeMessage('poolResult', result, { exchange: 'evaluation' }));

    expect(poolService.applyEvaluationResult).toHaveBeenCalledTimes(1);
    expect(poolService.applyEvaluationResult).toHaveBeenCalledWith(result);
    expect(businessService.applyEvaluationResult).toHaveBeenCalledTimes(0);
    expect(rabbit.state.acked).toHaveLength(1);
  });

  test('the businessResult key hands the payload to the business service as-is', async () => {
    await daemon.initialize();

    const result = makeResult({ entityType: 'business', entityId: 'business-1' });
    await deliver(RESULTS_QUEUE, 'businessResult', makeMessage('businessResult', result, { exchange: 'evaluation' }));

    expect(businessService.applyEvaluationResult).toHaveBeenCalledTimes(1);
    expect(businessService.applyEvaluationResult).toHaveBeenCalledWith(result);
    expect(poolService.applyEvaluationResult).toHaveBeenCalledTimes(0);
  });

  test('the routing key decides the service: a mismatched payload still goes where the key points', async () => {
    await daemon.initialize();

    const result = makeResult({ entityType: 'business', entityId: 'business-1' });
    await deliver(RESULTS_QUEUE, 'poolResult', makeMessage('poolResult', result, { exchange: 'evaluation' }));

    expect(poolService.applyEvaluationResult).toHaveBeenCalledWith(result);
    expect(businessService.applyEvaluationResult).toHaveBeenCalledTimes(0);
  });

  test('a result key nobody handles is acked without touching a service', async () => {
    await daemon.initialize();

    await deliver(RESULTS_QUEUE, 'results', makeMessage('results', makeResult(), { exchange: 'evaluation' }));

    expect(poolService.applyEvaluationResult).toHaveBeenCalledTimes(0);
    expect(businessService.applyEvaluationResult).toHaveBeenCalledTimes(0);
    expect(rabbit.state.acked).toHaveLength(1);
  });

  test('a service failure halts the queue: nack with requeue and unsubscribe', async () => {
    consumerService.state.outcome = 'halted';
    poolService.syncPoolPausedState.mockImplementationOnce(async () => {
      throw new Error('mongo is down');
    });
    await daemon.initialize();

    await deliver(
      BLOCKCHAIN_QUEUE,
      'Pool_PausedStateChanged',
      makeMessage('Pool_PausedStateChanged', makeStockEvent('Pool_PausedStateChanged')),
    );

    expect(rabbit.state.nacked).toHaveLength(1);
    expect(rabbit.state.nacked[0].requeue).toBe(true);
    expect(rabbit.state.cancelled).toEqual([`ctag-${BLOCKCHAIN_QUEUE}`]);
    // The other queue keeps its subscription.
    expect(rabbit.state.handlers.get(RESULTS_QUEUE)).toBeDefined();
  });

  test('a malformed payload is reported and never reaches a service', async () => {
    await daemon.initialize();

    await deliver(BLOCKCHAIN_QUEUE, 'Pool_ReservesUpdated', makeMessage('Pool_ReservesUpdated', null, { raw: '{not json' }));

    const error = consumerService.state.handlerError as Error;
    expect(error.message).toContain('not valid JSON');
    expect(poolService.syncPoolReserves).toHaveBeenCalledTimes(0);
  });

  test('a malformed evaluation result is reported and halts the queue', async () => {
    consumerService.state.outcome = 'halted';
    await daemon.initialize();

    await deliver(RESULTS_QUEUE, 'poolResult', makeMessage('poolResult', null, { raw: 'not-json', exchange: 'evaluation' }));

    expect((consumerService.state.handlerError as Error).message).toContain('not valid JSON');
    expect(rabbit.state.nacked).toHaveLength(1);
    expect(poolService.applyEvaluationResult).toHaveBeenCalledTimes(0);
  });

  test('stop() clears timers and unsubscribes from both queues while connected', async () => {
    await daemon.initialize();

    await daemon.stop();

    expect(rabbit.state.cancelled).toEqual([`ctag-${BLOCKCHAIN_QUEUE}`, `ctag-${RESULTS_QUEUE}`]);
  });

  test('stop() without a connection does not try to unsubscribe', async () => {
    await daemon.initialize();
    rabbit.state.connected = false;

    await daemon.stop();

    expect(rabbit.state.cancelled).toEqual([]);
  });
});
