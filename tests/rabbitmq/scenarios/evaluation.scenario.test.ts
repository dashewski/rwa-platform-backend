/**
 * Scenario: rwa ← `evaluation` ← ai-evaluator.
 *
 * The link has two halves and both are exercised for real:
 *   ai-evaluator: RiskEvaluationService stores an evaluation in Mongo and
 *     queues the result in the outbox (in the same transaction);
 *   outbox: publishes `poolResult` / `businessResult` to the `evaluation`
 *     exchange;
 *   rwa: the inbox deduplicates by `evaluationId` and applies the result.
 *
 * Real: RiskEvaluationService, evaluation repository, outbox service, inbox
 * daemon, inbox service, broker, Mongo. Stubbed: the eden clients and
 * OpenRouter (no network, no API key) — exactly as in the unit tests of that
 * service; the LLM itself is not part of the protocol.
 *
 * Run:
 *   bun --env-file=infrastructure/docker/.env test --timeout=180000 \
 *     tests/rabbitmq/scenarios/evaluation.scenario.test.ts
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { connect } from 'amqplib';
import type { ChannelModel, ConfirmChannel } from 'amqplib';
import {
  RABBIT_URI,
  ScopedClient,
  connectMongo,
  deleteScopedTopology,
  dropMongo,
  recorder,
  scenarioPrefix,
  waitFor,
  type Recorder,
} from './harness';
import { InboxConsumerService } from '@shared/inbox-consumer/src/services/inboxConsumer.service';
import { InboxConsumerMessageRepository } from '@shared/inbox-consumer/src/repositories/inboxConsumerMessage.repository';
import { InboxConsumerMessageEntity } from '@shared/inbox-consumer/src/models/entity/inboxConsumerMessage.entity';
import { OutboxPublisherService } from '@shared/outbox-publisher/src/services/outboxPublisher.service';
import { OutboxPublisherMessageRepository } from '@shared/outbox-publisher/src/repositories/outboxPublisherMessage.repository';
import { OutboxPublisherMessageEntity } from '@shared/outbox-publisher/src/models/entity/outboxPublisherMessage.entity';
import { RiskEvaluationService } from '../../../services/ai-evaluator/src/services/riskEvaluation.service';
import { EvaluationRepository } from '../../../services/ai-evaluator/src/repositories/evaluation.repository';
import { EvaluationEntity } from '../../../services/ai-evaluator/src/models/entity/evaluation.entity';
import { RabbitMQClient as AiEvaluatorClient } from '../../../services/ai-evaluator/src/clients/rabbitmq.client';
import { RabbitMQClient as RwaClient } from '../../../services/rwa/src/clients/rabbitmq.client';
import { InboxConsumerDaemon as RwaInbox } from '../../../services/rwa/src/daemons/inboxConsumer.daemon';
import {
  createFakeEdenClients,
  edenOk,
} from '../../../services/ai-evaluator/tests/fakes/eden.clients.fake';
import { createFakeOpenRouterClient } from '../../../services/ai-evaluator/tests/fakes/openrouter.client.fake';

const PREFIX = scenarioPrefix('evaluation');
const EXCHANGE = 'evaluation';
const QUEUE = 'evaluation.results';

const BUSINESS_ID = 'business-1';
const OWNER = { ownerId: 'owner-1', ownerType: 'business' };

describe('scenario: ai-evaluator → evaluation → rwa', () => {
  const prefix = PREFIX;
  const topologies = {
    evaluator: new AiEvaluatorClient('amqp://placeholder').getTopologyDefinition(),
    rwa: new RwaClient('amqp://placeholder').getTopologyDefinition(),
  };

  const evaluatorClient = new ScopedClient('ai-evaluator', prefix, topologies.evaluator);
  const rwaClient = new ScopedClient('rwa', prefix, topologies.rwa);

  const businessService: Recorder = recorder();
  const poolService: Recorder = recorder();
  const eden = createFakeEdenClients();
  const openRouter = createFakeOpenRouterClient();

  let daemon: RwaInbox;
  let raw: { connection: ChannelModel; channel: ConfirmChannel };
  let outbox: OutboxPublisherService;
  let risk: RiskEvaluationService;
  let evaluationId: string;
  let published: { evaluationId: string; entityType: string; entityId: string; riskScore: number };

  beforeAll(async () => {
    await connectMongo('rwa_scn_evaluation');
    // createIndexes, not init(): see the harness note about cached init() results
    await InboxConsumerMessageEntity.createIndexes();
    await OutboxPublisherMessageEntity.createIndexes();
    await EvaluationEntity.createIndexes();

    const connection = await connect(RABBIT_URI, { heartbeat: 5 });
    connection.on('error', () => undefined);
    const channel = await connection.createConfirmChannel();
    channel.on('error', () => undefined);
    raw = { connection, channel };

    await evaluatorClient.initialize();
    await rwaClient.initialize();

    const inbox = new InboxConsumerService(new InboxConsumerMessageRepository());
    daemon = new RwaInbox(rwaClient as never, inbox, businessService as never, poolService as never);
    await daemon.initialize();

    outbox = new OutboxPublisherService(evaluatorClient, new OutboxPublisherMessageRepository());

    risk = new RiskEvaluationService(
      new EvaluationRepository(),
      openRouter as never,
      eden.rwaClient as never,
      eden.documentsClient as never,
      eden.galleryClient as never,
      eden.reactionsClient as never,
      eden.questionsClient as never,
      eden.portfolioClient as never,
      outbox,
      EXCHANGE,
      'test/model',
      20,
      false,
    );
  });

  afterAll(async () => {
    await daemon?.stop();

    for (const topology of Object.values(topologies)) {
      await deleteScopedTopology(prefix, topology, raw.channel);
    }

    await raw.connection.close().catch(() => undefined);
    await evaluatorClient.disconnect();
    await rwaClient.disconnect();
    await dropMongo();
  });

  test('the evaluator stores the result and queues exactly one outbox row in the same transaction', async () => {
    eden.rwaClient.getBusiness.setDefaultResponse(
      edenOk({ id: BUSINESS_ID, name: 'Acme', businessType: 'energy', country: 'DE', tags: [] }),
    );
    eden.rwaClient.getPools.setDefaultResponse(edenOk([]));
    eden.documentsClient.getDocuments.setDefaultResponse(edenOk([]));
    eden.galleryClient.getImages.setDefaultResponse(edenOk([]));
    eden.reactionsClient.getEntityReactions.setDefaultResponse(edenOk({ reactions: {} }));
    eden.questionsClient.getQuestions.setDefaultResponse(edenOk([]));

    // no documents and no images were primed, so stage 1 (file selection) is
    // skipped and the only completion is the risk score itself
    openRouter.queueJsonResponse({ riskScore: 42, reasoning: 'looks fine', factors: [] });

    await risk.evaluateBusiness({ businessId: BUSINESS_ID, ...OWNER }, async () => undefined);

    const evaluations = await EvaluationEntity.find({ parentId: BUSINESS_ID }).lean();
    expect(evaluations).toHaveLength(1);
    expect(evaluations[0].riskScore).toBe(42);
    evaluationId = evaluations[0]._id.toString();

    const rows = await OutboxPublisherMessageEntity.find({ exchange: EXCHANGE }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      routingKey: 'businessResult',
      messageId: evaluationId,
      status: 'pending',
    });

    published = rows[0].payload as typeof published;
    expect(published).toEqual({
      evaluationId,
      entityType: 'business',
      entityId: BUSINESS_ID,
      riskScore: 42,
    });
  }, 60_000);

  test('the outbox publishes the result and rwa applies it once', async () => {
    await outbox.processOutbox(EXCHANGE, false, 5, 10);

    await waitFor(() => businessService.callsOf('applyEvaluationResult').length === 1, 30_000);

    expect(businessService.callsOf('applyEvaluationResult')[0][0]).toEqual(published);

    const row = await OutboxPublisherMessageEntity.findOne({ exchange: EXCHANGE, messageId: evaluationId }).lean();
    expect(row?.status).toBe('sent');

    expect(await InboxConsumerMessageEntity.countDocuments({ messageId: evaluationId })).toBe(1);
    expect((await raw.channel.checkQueue(rwaClient.queueName(QUEUE))).messageCount).toBe(0);
  }, 60_000);

  test('a redelivery of the same result is a no-op: the inbox marker already exists', async () => {
    await evaluatorClient.publish(EXCHANGE, 'businessResult', published, { messageId: evaluationId });
    await waitFor(
      async () => (await raw.channel.checkQueue(rwaClient.queueName(QUEUE))).messageCount === 0,
      30_000,
    );
    await Bun.sleep(200);

    expect(businessService.callsOf('applyEvaluationResult')).toHaveLength(1);
  }, 60_000);

  test('pool results travel the other routing key to the pool service', async () => {
    const payload = { evaluationId: 'pool-eval-1', entityType: 'pool', entityId: 'pool-1', riskScore: 11 };

    // this message is only delivered if the duplicate above was acked: with prefetch 1
    // an unacked duplicate blocks the whole queue
    await evaluatorClient.publish(EXCHANGE, 'poolResult', payload, { messageId: 'pool-eval-1' });
    await waitFor(() => poolService.callsOf('applyEvaluationResult').length === 1, 30_000);

    expect(poolService.callsOf('applyEvaluationResult')[0][0]).toEqual(payload);
    expect(businessService.callsOf('applyEvaluationResult')).toHaveLength(1);
  }, 60_000);

  test('a routing key nobody bound is returned to the publisher, not silently dropped', async () => {
    await expect(
      evaluatorClient.publish(EXCHANGE, 'unknownResult', { evaluationId: 'x' }, { messageId: 'unknown-1' }),
    ).rejects.toThrow(/no queue is bound to routing key "unknownResult"/);
  }, 30_000);

  test('an always-failing result exhausts the attempts and is parked, not lost', async () => {
    await daemon.stop();

    const failingBusiness = {
      applyEvaluationResult: async () => {
        throw new Error('cannot apply the result');
      },
    };
    const failingInbox = new InboxConsumerService(new InboxConsumerMessageRepository());
    daemon = new RwaInbox(rwaClient as never, failingInbox, failingBusiness as never, poolService as never);
    await daemon.initialize();

    // the broker would add x-death itself; publish the count of a finished third cycle
    await evaluatorClient.publish(
      EXCHANGE,
      'businessResult',
      { evaluationId: 'poison-1', entityType: 'business', entityId: BUSINESS_ID, riskScore: 1 },
      {
        messageId: 'poison-1',
        headers: { 'x-death': [{ queue: `${QUEUE}.retry`, reason: 'expired', count: 3 }] },
      } as never,
    );

    const parked = rwaClient.queueName(`${QUEUE}.parked`);
    await waitFor(async () => (await raw.channel.checkQueue(parked)).messageCount === 1, 60_000);

    expect(await InboxConsumerMessageEntity.countDocuments({ messageId: 'poison-1' })).toBe(0);
  }, 120_000);
});
