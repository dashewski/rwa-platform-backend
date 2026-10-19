/**
 * Unit tests for the ai-evaluator InboxConsumerDaemon — routing only.
 *
 * The daemon extends the shared BaseInboxConsumerDaemon: it declares the
 * `evaluation.requests` queue, the prefetch and the routing table that maps the
 * two request keys (`evaluatePool`, `evaluateBusiness`) onto the risk
 * evaluation service. The RabbitMQ client, the consumer service and the risk
 * evaluation service are fakes: no broker, no database, no network.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { ConsumeMessage } from 'amqplib';
import { InboxConsumerDaemon } from '../src/daemons/inboxConsumer.daemon';
import type { RabbitMQClient } from '../src/clients/rabbitmq.client';
import type { InboxConsumerService } from '@shared/inbox-consumer';
import type { RiskEvaluationService } from '../src/services/riskEvaluation.service';
import { createConsumeMessage, createFakeRabbitMQClient } from './fakes/rabbitmq.client.fake';

const QUEUE = 'evaluation.requests';

const POOL_ARGS = { poolId: 'pool-1', ownerId: 'owner-1', ownerType: 'business' };
const BUSINESS_ARGS = { businessId: 'business-1', ownerId: 'owner-1', ownerType: 'business' };

function createFakeRiskEvaluationService() {
  return {
    evaluatePool: mock(async (_params: { poolId: string; ownerId: string; ownerType: string }): Promise<void> => {}),
    evaluateBusiness: mock(
      async (_params: { businessId: string; ownerId: string; ownerType: string }): Promise<void> => {},
    ),
  };
}

/** Consumer service stub: runs the delivery callback and reports the outcome. */
function createFakeConsumerService() {
  const state = {
    outcome: 'acked' as 'acked' | 'halted',
    statuses: new Map<string, 'running' | 'halted'>(),
    handlerError: null as unknown,
  };

  const service = {
    state,

    handle: mock(async (queueName: string, _message: ConsumeMessage, handler: () => Promise<void>) => {
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

describe('ai-evaluator InboxConsumerDaemon (unit, fakes for client / consumer service / risk service)', () => {
  let rabbit: ReturnType<typeof createFakeRabbitMQClient>;
  let consumerService: ReturnType<typeof createFakeConsumerService>;
  let riskService: ReturnType<typeof createFakeRiskEvaluationService>;
  let daemon: InboxConsumerDaemon;

  beforeEach(() => {
    rabbit = createFakeRabbitMQClient();
    consumerService = createFakeConsumerService();
    riskService = createFakeRiskEvaluationService();
    daemon = new InboxConsumerDaemon(
      rabbit as unknown as RabbitMQClient,
      consumerService as unknown as InboxConsumerService,
      riskService as unknown as RiskEvaluationService,
    );
  });

  async function deliver(routingKey: string, message: ConsumeMessage): Promise<void> {
    const consumer = rabbit.consumers.get(QUEUE);
    if (!consumer) throw new Error('the daemon never subscribed');
    await consumer.handler(
      { ...message, fields: { ...message.fields, routingKey } } as unknown as ConsumeMessage,
    );
  }

  test('subscribes only to the requests queue, with prefetch 1', async () => {
    await daemon.initialize();

    expect(rabbit.consumers.get(QUEUE)?.options).toEqual({ prefetch: 1 });
    expect(rabbit.consume).toHaveBeenCalledTimes(1);
  });

  test('the evaluatePool key runs the pool pipeline with the payload as-is', async () => {
    await daemon.initialize();

    await deliver('evaluatePool', createConsumeMessage(POOL_ARGS));

    expect(riskService.evaluatePool).toHaveBeenCalledTimes(1);
    expect(riskService.evaluatePool).toHaveBeenCalledWith(POOL_ARGS);
    expect(riskService.evaluateBusiness).toHaveBeenCalledTimes(0);
    expect(rabbit.acked).toHaveLength(1);
    expect(rabbit.nacked).toEqual([]);
  });

  test('the evaluateBusiness key runs the business pipeline with the payload as-is', async () => {
    await daemon.initialize();

    await deliver('evaluateBusiness', createConsumeMessage(BUSINESS_ARGS));

    expect(riskService.evaluateBusiness).toHaveBeenCalledWith(BUSINESS_ARGS);
    expect(riskService.evaluatePool).toHaveBeenCalledTimes(0);
    expect(rabbit.acked).toHaveLength(1);
  });

  test('a request that no argument survives is passed on unchanged (the service owns validation)', async () => {
    await daemon.initialize();

    const incomplete = { ownerId: 'owner-1' };
    await deliver('evaluatePool', createConsumeMessage(incomplete));

    expect(riskService.evaluatePool).toHaveBeenCalledWith(incomplete);
  });

  test('a key without a handler is acked without touching the service', async () => {
    await daemon.initialize();

    await deliver('requests', createConsumeMessage(POOL_ARGS, 'requests'));

    expect(riskService.evaluatePool).toHaveBeenCalledTimes(0);
    expect(riskService.evaluateBusiness).toHaveBeenCalledTimes(0);
    expect(rabbit.acked).toHaveLength(1);
  });

  test('a malformed payload is reported and never reaches the service', async () => {
    await daemon.initialize();

    await deliver('evaluatePool', createConsumeMessage('{not json'));

    expect((consumerService.state.handlerError as Error).message).toContain('not valid JSON');
    expect(riskService.evaluatePool).toHaveBeenCalledTimes(0);
    expect(riskService.evaluateBusiness).toHaveBeenCalledTimes(0);
  });

  test('a service failure halts the queue: nack with requeue and unsubscribe', async () => {
    consumerService.state.outcome = 'halted';
    riskService.evaluatePool.mockImplementationOnce(async () => {
      throw new Error('openrouter is down');
    });
    await daemon.initialize();

    await deliver('evaluatePool', createConsumeMessage(POOL_ARGS));

    expect(consumerService.state.handlerError).toBeInstanceOf(Error);
    expect(rabbit.nacked).toHaveLength(1);
    expect(rabbit.nacked[0].requeue).toBe(true);
    expect(rabbit.cancelConsumer).toHaveBeenCalledWith(`ctag-${QUEUE}`);
  });

  test('a failing business evaluation halts the queue as well', async () => {
    consumerService.state.outcome = 'halted';
    riskService.evaluateBusiness.mockImplementationOnce(async () => {
      throw new Error('rwa service is down');
    });
    await daemon.initialize();

    await deliver('evaluateBusiness', createConsumeMessage(BUSINESS_ARGS));

    expect(rabbit.nacked).toHaveLength(1);
    expect(rabbit.nacked[0].requeue).toBe(true);
  });

  test('stop() unsubscribes while connected and skips it when the connection is gone', async () => {
    await daemon.initialize();

    await daemon.stop();
    expect(rabbit.cancelConsumer).toHaveBeenCalledWith(`ctag-${QUEUE}`);

    rabbit.cancelConsumer.mockClear();
    rabbit.setConnected(false);
    await daemon.stop();
    expect(rabbit.cancelConsumer).toHaveBeenCalledTimes(0);
  });
});
