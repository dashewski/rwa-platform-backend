/**
 * Unit tests for the evaluator split:
 *  - RiskEvaluationService — pure domain: collect -> select -> summarize -> score,
 *    plus read access to finished evaluations;
 *  - EvaluationJobService — the local queue: cooldown, enqueue, claim, retry, idempotency;
 *  - EvaluationWorkerDaemon — a dumb loop that calls processNext on an interval.
 *
 * Repositories and clients are in-memory fakes: no database, no broker, no network.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import mongoose from 'mongoose';
import { Types } from 'mongoose';
import { RiskEvaluationService } from '../src/services/riskEvaluation.service';
import { EvaluationJobService } from '../src/services/evaluationJob.service';
import { EvaluationWorkerDaemon } from '../src/daemons/evaluationWorker.daemon';
import type { EvaluationRepository } from '../src/repositories/evaluation.repository';
import type { EvaluationJobRepository } from '../src/repositories/evaluationJob.repository';
import type {
  RwaClient,
  DocumentsClient,
  GalleryClient,
  ReactionsClient,
  QuestionsClient,
  PortfolioClient,
} from '../src/clients/eden.clients';
import type { OpenRouterClient } from '@shared/openrouter/client';
import type { OutboxPublisherService } from '@shared/outbox-publisher';
import type { RabbitMQClient } from '../src/clients/rabbitmq.client';
import { createFakeEvaluationRepository } from './fakes/evaluation.repository.fake';
import { createFakeEvaluationJobRepository } from './fakes/evaluationJob.repository.fake';
import {
  createFakeEdenClients,
  edenError,
  edenOk,
  type FakeBusiness,
  type FakeDocumentFile,
  type FakeGalleryImage,
  type FakePool,
} from './fakes/eden.clients.fake';
import { createFakeOpenRouterClient } from './fakes/openrouter.client.fake';
import { createFakeOutboxPublisher } from './fakes/outbox-publisher.fake';

const MODEL = 'test/model';

const POOL_PARAMS = { entityType: 'pool' as const, entityId: 'pool-1', ownerId: 'owner-1', ownerType: 'business' };
const BUSINESS_PARAMS = {
  entityType: 'business' as const,
  entityId: 'business-1',
  ownerId: 'owner-1',
  ownerType: 'business',
};

const POOL: FakePool = {
  id: 'pool-1',
  name: 'Solar Farm',
  description: 'A community solar farm',
  tags: ['energy', 'green'],
  entryFeePercent: 1,
  exitFeePercent: 0.5,
  expectedHoldAmount: 1000,
  expectedRwaAmount: 2000,
  rewardPercent: 5,
  businessId: 'business-1',
  poolAddress: '0xpool-address',
};

const BUSINESS: FakeBusiness = {
  id: 'business-1',
  name: 'Acme Renewables',
  businessType: 'energy',
  country: 'DE',
  tags: ['renewables'],
  tokenAddress: '0xbusiness-token',
};

const DOCUMENT_FILE: FakeDocumentFile = {
  id: 'doc-1',
  name: 'Pitch deck.pdf',
  mimeType: 'application/pdf',
  url: 'https://files.local/pitch.pdf',
};

const IMAGE_FILE: FakeGalleryImage = {
  id: 'img-1',
  name: 'Storefront.jpg',
  url: 'https://files.local/storefront.jpg',
};

const SUMMARY = 'Acme Renewables operates a community solar farm in Germany with 1 MW of installed capacity.';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate: () => boolean, timeoutMs = 2000) {
  const startedAt = Date.now();

  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error('waitFor timeout');
    await sleep(5);
  }
}

function setup(options: { maxFilesPerRequest?: number; cooldownSeconds?: number } = {}) {
  (mongoose.connection as unknown as { transaction: unknown }).transaction = async <T>(
    fn: () => Promise<T>,
  ): Promise<T> => fn();

  const evaluationRepository = createFakeEvaluationRepository();
  const jobRepository = createFakeEvaluationJobRepository();
  const openRouterClient = createFakeOpenRouterClient();
  const eden = createFakeEdenClients();
  const outbox = createFakeOutboxPublisher();

  const riskEvaluationService = new RiskEvaluationService(
    evaluationRepository as unknown as EvaluationRepository,
    openRouterClient as unknown as OpenRouterClient,
    eden.rwaClient as unknown as RwaClient,
    eden.documentsClient as unknown as DocumentsClient,
    eden.galleryClient as unknown as GalleryClient,
    eden.reactionsClient as unknown as ReactionsClient,
    eden.questionsClient as unknown as QuestionsClient,
    eden.portfolioClient as unknown as PortfolioClient,
    MODEL,
    options.maxFilesPerRequest ?? 20,
    false,
  );

  const evaluationJobService = new EvaluationJobService(
    evaluationRepository as unknown as EvaluationRepository,
    jobRepository as unknown as EvaluationJobRepository,
    riskEvaluationService,
    outbox as unknown as OutboxPublisherService<RabbitMQClient>,
    options.cooldownSeconds ?? 0,
  );

  return {
    evaluationRepository,
    jobRepository,
    openRouterClient,
    outbox,
    eden,
    riskEvaluationService,
    evaluationJobService,
  };
}

type Fakes = ReturnType<typeof setup>;

function primePoolPath(fakes: Fakes, options: { documents?: FakeDocumentFile[]; images?: FakeGalleryImage[] } = {}) {
  fakes.eden.rwaClient.getPool.setDefaultResponse(edenOk(POOL));
  fakes.eden.rwaClient.getBusiness.setDefaultResponse(edenOk(BUSINESS));
  fakes.eden.rwaClient.getPools.setDefaultResponse(edenOk([POOL]));
  fakes.eden.documentsClient.getDocuments.setDefaultResponse(edenOk(options.documents ?? []));
  fakes.eden.galleryClient.getImages.setDefaultResponse(edenOk(options.images ?? []));
  fakes.eden.reactionsClient.getEntityReactions.setDefaultResponse(edenOk({ reactions: { like: 3 } }));
  fakes.eden.questionsClient.getQuestions.setDefaultResponse(edenOk([]));
  fakes.eden.portfolioClient.getBalances.setDefaultResponse(edenOk([]));
}

function primeBusinessPath(fakes: Fakes) {
  fakes.eden.rwaClient.getBusiness.setDefaultResponse(edenOk(BUSINESS));
  fakes.eden.rwaClient.getPools.setDefaultResponse(edenOk([]));
  fakes.eden.documentsClient.getDocuments.setDefaultResponse(edenOk([]));
  fakes.eden.galleryClient.getImages.setDefaultResponse(edenOk([]));
  fakes.eden.reactionsClient.getEntityReactions.setDefaultResponse(edenOk({ reactions: {} }));
  fakes.eden.questionsClient.getQuestions.setDefaultResponse(edenOk([]));
}

function seedEvaluation(fakes: Fakes, overrides: Record<string, unknown> = {}) {
  return fakes.evaluationRepository.create({
    entityType: 'pool',
    parentId: 'pool-1',
    grandParentId: 'business-1',
    ownerId: 'owner-1',
    ownerType: 'business',
    summary: SUMMARY,
    sources: [],
    risk: { score: 42, pros: ['Solid team'], cons: ['Single market'] },
    modelUsed: MODEL,
    ...overrides,
  });
}

describe('RiskEvaluationService.evaluate', () => {
  test('pool with documents and images: select -> summarize -> score, payload keeps summary and sources', async () => {
    const fakes = setup();
    primePoolPath(fakes, { documents: [DOCUMENT_FILE], images: [IMAGE_FILE] });

    fakes.openRouterClient.queueJsonResponse({ requestedDocuments: ['doc-1'], requestedImages: ['img-1'] });
    fakes.openRouterClient.queueResponse(SUMMARY);
    fakes.openRouterClient.queueJsonResponse({ score: 42, pros: ['Solid team'], cons: ['Single market'] });

    const payload = await fakes.riskEvaluationService.evaluate({
      entityType: 'pool',
      entityId: 'pool-1',
    });

    expect(payload.grandParentId).toBe('business-1');
    expect(payload.summary).toBe(SUMMARY);
    expect(payload.risk).toEqual({ score: 42, pros: ['Solid team'], cons: ['Single market'] });
    expect(payload.sources).toHaveLength(2);
    expect(payload.sources[0]).toEqual({
      type: 'document',
      id: 'doc-1',
      name: 'Pitch deck.pdf',
      mimeType: 'application/pdf',
    });
    expect(payload.sources[1].type).toBe('image');
    expect(fakes.openRouterClient.chatCompletion).toHaveBeenCalledTimes(3);
    expect(fakes.evaluationRepository.create).toHaveBeenCalledTimes(0);
    expect(fakes.outbox.publish).toHaveBeenCalledTimes(0);
  });

  test('business without files: two model calls, no sources', async () => {
    const fakes = setup();
    primeBusinessPath(fakes);

    fakes.openRouterClient.queueResponse(SUMMARY);
    fakes.openRouterClient.queueJsonResponse({ score: 30, pros: ['Profitable'], cons: ['Small scale'] });

    const payload = await fakes.riskEvaluationService.evaluate({ entityType: 'business', entityId: 'business-1' });

    expect(payload.grandParentId).toBe('business-1');
    expect(payload.sources).toEqual([]);
    expect(payload.risk.score).toBe(30);
    expect(fakes.openRouterClient.chatCompletion).toHaveBeenCalledTimes(2);
  });

  test('an unknown document requested by the model is rejected', async () => {
    const fakes = setup();
    primePoolPath(fakes, { documents: [DOCUMENT_FILE] });

    fakes.openRouterClient.queueJsonResponse({ requestedDocuments: ['doc-unknown'], requestedImages: [] });

    const error: any = await fakes.riskEvaluationService
      .evaluate({ entityType: 'pool', entityId: 'pool-1' })
      .catch((thrown) => thrown);

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('NOT_FOUND');
  });

  test('an empty summary is a 502 AI_ERROR', async () => {
    const fakes = setup();
    primeBusinessPath(fakes);

    fakes.openRouterClient.queueResponse('   ');

    const error: any = await fakes.riskEvaluationService
      .evaluate({ entityType: 'business', entityId: 'business-1' })
      .catch((thrown) => thrown);

    expect(error.statusCode).toBe(502);
    expect(error.code).toBe('AI_ERROR');
  });

  test('a score outside 1..100 is a 502 AI_ERROR', async () => {
    const fakes = setup();
    primeBusinessPath(fakes);

    fakes.openRouterClient.queueResponse(SUMMARY);
    fakes.openRouterClient.queueJsonResponse({ score: 101, pros: [], cons: [] });

    const error: any = await fakes.riskEvaluationService
      .evaluate({ entityType: 'business', entityId: 'business-1' })
      .catch((thrown) => thrown);

    expect(error.statusCode).toBe(502);
    expect(error.code).toBe('AI_ERROR');
  });

  test('a failed RWA lookup is a 502', async () => {
    const fakes = setup();
    primeBusinessPath(fakes);
    fakes.eden.rwaClient.getBusiness.setDefaultResponse(edenError(500, { code: 'RWA_DOWN' }));

    const error: any = await fakes.riskEvaluationService
      .evaluate({ entityType: 'business', entityId: 'business-1' })
      .catch((thrown) => thrown);

    expect(error.statusCode).toBe(502);
  });
});

describe('RiskEvaluationService reads', () => {
  test('getEvaluation maps the stored document', async () => {
    const fakes = setup();
    const stored = await seedEvaluation(fakes);

    const evaluation = await fakes.riskEvaluationService.getEvaluation({ id: stored._id.toString() });

    expect(evaluation).toMatchObject({
      id: stored._id.toString(),
      entityType: 'pool',
      parentId: 'pool-1',
      summary: SUMMARY,
      risk: { score: 42, pros: ['Solid team'], cons: ['Single market'] },
    });
  });

  test('getEvaluations translates the riskScore sort key to the nested field', async () => {
    const fakes = setup();
    await seedEvaluation(fakes);

    await fakes.riskEvaluationService.getEvaluations({
      filter: { parentId: 'pool-1' },
      sort: { riskScore: 'desc' },
    });

    const [, sort] = fakes.evaluationRepository.findAll.mock.calls[0];

    expect(sort).toEqual({ 'risk.score': 'desc' });
  });
});

describe('EvaluationJobService.start', () => {
  test('creates a pending job and returns the evaluation id', async () => {
    const fakes = setup();

    const evaluationId = await fakes.evaluationJobService.start(POOL_PARAMS);

    const job = [...fakes.jobRepository.store.values()][0];

    expect(typeof evaluationId).toBe('string');
    expect(String(job.evaluationId)).toBe(evaluationId);
    expect(job.status).toBe('pending');
    expect(job.attempts).toBe(0);
  });

  test('rejects a repeated request during the cooldown window', async () => {
    const fakes = setup({ cooldownSeconds: 86_400 });
    await seedEvaluation(fakes);

    const error: any = await fakes.evaluationJobService.start(POOL_PARAMS).catch((thrown) => thrown);

    expect(error.statusCode).toBe(429);
    expect(error.code).toBe('EVALUATION_COOLDOWN');
    expect(fakes.jobRepository.store.size).toBe(0);
  });

  test('allows a new run once the cooldown has passed', async () => {
    const fakes = setup({ cooldownSeconds: 86_400 });
    const seeded = await seedEvaluation(fakes);

    await fakes.evaluationRepository.updateById(seeded._id.toString(), {
      createdAt: Math.floor(Date.now() / 1000) - 90_000,
    });

    const evaluationId = await fakes.evaluationJobService.start(POOL_PARAMS);

    expect(typeof evaluationId).toBe('string');
    expect(fakes.jobRepository.store.size).toBe(1);
  });
});

describe('EvaluationJobService.processNext', () => {
  test('runs the domain work and closes the job, publishing the risk score', async () => {
    const fakes = setup();
    primePoolPath(fakes);
    fakes.openRouterClient.queueResponse(SUMMARY);
    fakes.openRouterClient.queueJsonResponse({ score: 42, pros: ['Solid team'], cons: ['Single market'] });

    const evaluationId = await fakes.evaluationJobService.start(POOL_PARAMS);

    const processed = await fakes.evaluationJobService.processNext();

    const evaluation = [...fakes.evaluationRepository.store.values()][0];
    const job = [...fakes.jobRepository.store.values()][0];

    expect(processed).toBe(true);
    expect(evaluation._id.toString()).toBe(evaluationId);
    expect(evaluation.summary).toBe(SUMMARY);
    expect(evaluation.risk).toEqual({ score: 42, pros: ['Solid team'], cons: ['Single market'] });
    expect(fakes.outbox.publish).toHaveBeenCalledTimes(1);
    expect(fakes.outbox.published[0]).toMatchObject({ entityId: 'pool-1', riskScore: 42 });
    expect(job.status).toBe('completed');
  });

  test('a re-claimed job with an existing evaluation does not call the model again', async () => {
    const fakes = setup();
    const existing = await seedEvaluation(fakes, { _id: new Types.ObjectId() });

    await fakes.jobRepository.create({
      evaluationId: existing._id,
      entityType: 'pool',
      entityId: 'pool-1',
      ownerId: 'owner-1',
      ownerType: 'business',
      status: 'pending',
      attempts: 0,
    });

    await fakes.evaluationJobService.processNext();

    expect(fakes.openRouterClient.chatCompletion).toHaveBeenCalledTimes(0);
    expect([...fakes.jobRepository.store.values()][0].status).toBe('completed');
  });

  test('a failed run is released back with the error text', async () => {
    const fakes = setup();
    primeBusinessPath(fakes);
    fakes.openRouterClient.queueResponse('');

    await fakes.evaluationJobService.start(BUSINESS_PARAMS);
    await fakes.evaluationJobService.processNext();

    const job = [...fakes.jobRepository.store.values()][0];

    expect(job.status).toBe('pending');
    expect(job.attempts).toBe(1);
    expect(job.error).toContain('empty');
  });

  test('the job is failed once the attempts are exhausted', async () => {
    const fakes = setup();
    primeBusinessPath(fakes);
    fakes.openRouterClient.queueResponse('');

    await fakes.jobRepository.create({
      evaluationId: new Types.ObjectId(),
      entityType: 'business',
      entityId: 'business-1',
      ownerId: 'owner-1',
      ownerType: 'business',
      status: 'pending',
      attempts: 2,
    });

    await fakes.evaluationJobService.processNext();

    expect([...fakes.jobRepository.store.values()][0].status).toBe('failed');
  });
});

describe('EvaluationWorkerDaemon', () => {
  test('keeps claiming jobs on every tick and stops cleanly', async () => {
    const calls: string[] = [];
    const jobService = {
      processNext: mock(async () => {
        calls.push('processNext');
        return false;
      }),
    };

    const daemon = new EvaluationWorkerDaemon(jobService as never, 10, 5);

    await daemon.initialize();
    await waitFor(() => calls.length >= 2);
    await daemon.stop();

    const callsAtStop = calls.length;
    await sleep(50);

    expect(callsAtStop).toBe(calls.length);
    expect(calls.length).toBeGreaterThan(0);
  });

  test('a stuck job does not stop the loop from claiming', async () => {
    let calls = 0;
    const jobService = {
      processNext: mock(async () => {
        calls += 1;

        if (calls === 1) {
          return await new Promise<boolean>(() => undefined);
        }

        return false;
      }),
    };

    const daemon = new EvaluationWorkerDaemon(jobService as never, 10, 5);

    await daemon.initialize();
    await waitFor(() => calls >= 6);
    await daemon.stop();

    expect(calls).toBeGreaterThanOrEqual(6);
  });
});

beforeEach(() => {
  mock.restore();
});

describe('RiskEvaluationService deployment gate', () => {
  test('an undeployed pool is rejected before any model call', async () => {
    const fakes = setup();
    primePoolPath(fakes);
    fakes.eden.rwaClient.getPool.setDefaultResponse(edenOk({ ...POOL, poolAddress: undefined }));

    const error: any = await fakes.riskEvaluationService
      .evaluate({ entityType: 'pool', entityId: 'pool-1' })
      .catch((thrown) => thrown);

    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('NOT_DEPLOYED');
    expect(fakes.openRouterClient.chatCompletion).toHaveBeenCalledTimes(0);
  });

  test('an undeployed business is rejected before any model call', async () => {
    const fakes = setup();
    primeBusinessPath(fakes);
    fakes.eden.rwaClient.getBusiness.setDefaultResponse(edenOk({ ...BUSINESS, tokenAddress: undefined }));

    const error: any = await fakes.riskEvaluationService
      .evaluate({ entityType: 'business', entityId: 'business-1' })
      .catch((thrown) => thrown);

    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('NOT_DEPLOYED');
    expect(fakes.openRouterClient.chatCompletion).toHaveBeenCalledTimes(0);
  });

  test('a permanent 4xx failure does not burn retries: the job is failed at once', async () => {
    const fakes = setup();
    primeBusinessPath(fakes);
    fakes.eden.rwaClient.getBusiness.setDefaultResponse(edenOk({ ...BUSINESS, tokenAddress: undefined }));

    await fakes.evaluationJobService.start(BUSINESS_PARAMS);
    await fakes.evaluationJobService.processNext();

    const job = [...fakes.jobRepository.store.values()][0];

    expect(job.status).toBe('failed');
    expect(job.attempts).toBe(1);
    expect(job.error).toContain('not deployed');
  });
});
