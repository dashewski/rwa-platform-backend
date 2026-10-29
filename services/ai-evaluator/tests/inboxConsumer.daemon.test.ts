/**
 * Unit tests for the ai-evaluator inbox daemon — routing only.
 *
 * The daemon subscribes to its own `evaluation.requests` queue and hands each
 * request to RiskEvaluationService together with the commit closure. The
 * RabbitMQ client, the consumer service and the evaluation service are fakes:
 * no broker, no database, no LLM.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { ConsumeMessage } from 'amqplib';
import { InboxConsumerDaemon } from '../src/daemons/inboxConsumer.daemon';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import type { RabbitMQClient } from '../src/clients/rabbitmq.client';
import type { InboxConsumerService } from '@shared/inbox-consumer';
import type { RiskEvaluationService } from '../src/services/riskEvaluation.service';

const QUEUE = 'evaluation.requests';

function makeMessage(routingKey: string, body: unknown, options: { raw?: string } = {}): ConsumeMessage {
  return {
    content: Buffer.from(options.raw ?? JSON.stringify(body)),
    fields: { routingKey, redelivered: false, deliveryTag: 1, exchange: 'evaluation', consumerTag: 'ctag' },
    properties: { messageId: `evaluation-${routingKey}` },
  } as unknown as ConsumeMessage;
}

function createFakeRabbitClient() {
  const state = {
    consumed: [] as Array<{ queue: string; options: unknown }>,
    acked: [] as ConsumeMessage[],
    nacked: [] as Array<{ message: ConsumeMessage; requeue: boolean }>,
    parked: [] as Array<{ queue: string; payload: unknown }>,
    cancelled: [] as string[],
    deferAfterAttempts: Number.POSITIVE_INFINITY,
    parkAfterCycles: Number.POSITIVE_INFINITY,
    connected: true,
    handler: null as null | ((message: ConsumeMessage | null) => Promise<void>),
  };

  const client = {
    getEvaluationRequestsQueue: () => 'evaluation.requests',
    state,

    consume: mock(
      async (queue: string, handler: (message: ConsumeMessage | null) => Promise<void>, options: unknown) => {
        state.consumed.push({ queue, options });
        state.handler = handler;
        return `ctag-${state.consumed.length}`;
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

    park: mock(async (queue: string, payload: unknown) => {
      state.parked.push({ queue, payload });
    }),

    getQueueDeferAfterAttempts: mock(() => state.deferAfterAttempts),
    getQueueParkAfterCycles: mock(() => state.parkAfterCycles),
    isConnected: mock(() => state.connected),
  };

  return client;
}

function createFakeConsumerService() {
  const state = { markers: new Set<string>(), commits: [] as string[] };

  return {
    state,

    commit: mock(async (messageId: string): Promise<void> => {
      state.commits.push(messageId);
      state.markers.add(messageId);
    }),

    isCommitted: mock(async (messageId: string): Promise<boolean> => state.markers.has(messageId)),
  };
}

function createFakeRiskEvaluationService() {
  const state = { pools: [] as unknown[], businesses: [] as unknown[], error: null as unknown };

  return {
    state,

    evaluatePool: mock(async (request: unknown, commitInbox: () => Promise<void>): Promise<void> => {
      if (state.error) throw state.error;
      await commitInbox();
      state.pools.push(request);
    }),

    evaluateBusiness: mock(async (request: unknown, commitInbox: () => Promise<void>): Promise<void> => {
      if (state.error) throw state.error;
      await commitInbox();
      state.businesses.push(request);
    }),
  };
}

let logLines: string[] = [];
const original = { warn: logger.warn, error: logger.error };

function captureLogs(): void {
  logLines = [];
  logger.warn = ((...args: unknown[]) => {
    logLines.push(args.map(String).join(' '));
  }) as typeof logger.warn;
  logger.error = ((...args: unknown[]) => {
    logLines.push(args.map(String).join(' '));
  }) as typeof logger.error;
}

function restoreLogs(): void {
  logger.warn = original.warn;
  logger.error = original.error;
}

describe('ai-evaluator InboxConsumerDaemon (unit, fake client + fake services)', () => {
  let rabbit: ReturnType<typeof createFakeRabbitClient>;
  let consumer: ReturnType<typeof createFakeConsumerService>;
  let risk: ReturnType<typeof createFakeRiskEvaluationService>;
  let daemon: InboxConsumerDaemon;

  beforeEach(() => {
    rabbit = createFakeRabbitClient();
    consumer = createFakeConsumerService();
    risk = createFakeRiskEvaluationService();
    daemon = new InboxConsumerDaemon(
      rabbit as unknown as RabbitMQClient,
      consumer as unknown as InboxConsumerService,
      risk as unknown as RiskEvaluationService,
    );
    captureLogs();
  });

  afterEach(async () => {
    await daemon.stop();
    restoreLogs();
  });

  async function deliver(message: ConsumeMessage): Promise<void> {
    if (!rabbit.state.handler) throw new Error('the daemon never subscribed');
    const settled = rabbit.state.acked.length + rabbit.state.nacked.length;

    await rabbit.state.handler(message);

    for (let attempt = 0; attempt < 1_000; attempt += 1) {
      if (rabbit.state.acked.length + rabbit.state.nacked.length > settled) return;
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    throw new Error('the delivery did not settle (no ack / nack)');
  }

  test('subscribes to evaluation.requests with prefetch 5 (parallel)', async () => {
    await daemon.initialize();

    expect(rabbit.state.consumed).toEqual([{ queue: QUEUE, options: { prefetch: 5 } }]);
  });

  test('evaluatePool hands the request to the service and commits the marker', async () => {
    await daemon.initialize();
    const request = { poolId: 'pool-1', ownerId: 'user-1', ownerType: 'user' };

    await deliver(makeMessage('evaluatePool', request));

    expect(risk.state.pools).toEqual([request]);
    expect(consumer.state.commits).toEqual(['evaluation-evaluatePool']);
    expect(rabbit.state.acked).toHaveLength(1);
  });

  test('evaluateBusiness hands the request to the service and commits the marker', async () => {
    await daemon.initialize();
    const request = { businessId: 'business-1', ownerId: 'user-1', ownerType: 'user' };

    await deliver(makeMessage('evaluateBusiness', request));

    expect(risk.state.businesses).toEqual([request]);
    expect(risk.state.pools).toEqual([]);
    expect(rabbit.state.acked).toHaveLength(1);
  });

  test('an unknown routing key is warned about and acked without touching the service', async () => {
    await daemon.initialize();

    await deliver(makeMessage('poolResult', { evaluationId: 'evaluation-1' }));

    expect(risk.state.pools).toEqual([]);
    expect(risk.state.businesses).toEqual([]);
    expect(logLines.some((line) => line.includes('no handler registered for poolResult'))).toBe(true);
    expect(rabbit.state.acked).toHaveLength(1);
  });

  test('an exhausted evaluation is handed to the retry queue (requeue=false)', async () => {
    rabbit.state.deferAfterAttempts = 1;
    await daemon.initialize();
    risk.state.error = new Error('openrouter timed out');

    await deliver(makeMessage('evaluatePool', { poolId: 'pool-1', ownerId: 'user-1', ownerType: 'user' }));

    expect(consumer.state.commits).toEqual([]);
    expect(rabbit.state.acked).toHaveLength(0);
    expect(rabbit.state.nacked).toHaveLength(1);
    expect(rabbit.state.nacked[0].requeue).toBe(false);
  });

  test('a malformed request never reaches the service', async () => {
    rabbit.state.deferAfterAttempts = 1;
    await daemon.initialize();

    await deliver(makeMessage('evaluatePool', {}, { raw: 'not-json{' }));

    expect(risk.state.pools).toEqual([]);
    expect(rabbit.state.nacked).toHaveLength(1);
    expect(rabbit.state.acked).toHaveLength(0);
  });

  test('stop cancels the consumer while the connection is alive', async () => {
    await daemon.initialize();

    await daemon.stop();

    expect(rabbit.state.cancelled).toEqual(['ctag-1']);
  });
});
