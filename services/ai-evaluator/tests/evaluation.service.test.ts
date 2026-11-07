/**
 * Unit tests for the evaluator steps:
 *  - EvaluationService — pure domain: availability, context, select, summarize, score, save,
 *    plus read access to finished evaluations.
 *
 * Repositories and clients are in-memory fakes: no database, no broker, no network.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import mongoose from 'mongoose';
import { Types } from 'mongoose';
import { EvaluationService } from '../src/services/evaluation.service';
import type { EvaluationRepository } from '../src/repositories/evaluation.repository';
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
import {
  createFakeEdenClients,
  edenOk,
  type FakeBusiness,
  type FakeDocumentFile,
  type FakeGalleryImage,
  type FakePool,
} from './fakes/eden.clients.fake';
import { createFakeOpenRouterClient } from './fakes/openrouter.client.fake';
import { createFakeOutboxPublisher } from './fakes/outbox-publisher.fake';

const MODEL = 'test/model';

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
const RISK = { score: 42, pros: ['Solid team'], cons: ['Single market'] };

function setup(options: { maxFilesPerRequest?: number; cooldownSeconds?: number } = {}) {
  (mongoose.connection as unknown as { transaction: unknown }).transaction = async <T>(
    fn: () => Promise<T>,
  ): Promise<T> => fn();

  const evaluationRepository = createFakeEvaluationRepository();
  const jobQueueService = { start: mock(async () => {}) };
  const jobQueueClient = { getEvaluationQueue: () => 'evaluation' };
  const openRouterClient = createFakeOpenRouterClient();
  const eden = createFakeEdenClients();
  const outbox = createFakeOutboxPublisher();

  const evaluationService = new EvaluationService(
    evaluationRepository as unknown as EvaluationRepository,
    jobQueueService as never,
    jobQueueClient as never,
    openRouterClient as unknown as OpenRouterClient,
    eden.rwaClient as unknown as RwaClient,
    eden.documentsClient as unknown as DocumentsClient,
    eden.galleryClient as unknown as GalleryClient,
    eden.reactionsClient as unknown as ReactionsClient,
    eden.questionsClient as unknown as QuestionsClient,
    eden.portfolioClient as unknown as PortfolioClient,
    outbox as unknown as OutboxPublisherService<RabbitMQClient>,
    MODEL,
    options.maxFilesPerRequest ?? 20,
    options.cooldownSeconds ?? 0,
    false,
  );

  return { evaluationRepository, jobQueueService, openRouterClient, eden, outbox, evaluationService };
}

type Fakes = ReturnType<typeof setup>;

function primePoolPath(fakes: Fakes, options: { documents?: FakeDocumentFile[]; images?: FakeGalleryImage[] } = {}) {
  fakes.eden.rwaClient.getPool.setDefaultResponse(
    edenOk({ ...POOL, ownerId: 'owner-1', ownerType: 'business' } as never),
  );
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
    risk: RISK,
    modelUsed: MODEL,
    ...overrides,
  });
}

describe('EvaluationService.collectContext', () => {
  test('a pool gathers its own and the business data, plus the files of the documents and gallery', async () => {
    const fakes = setup();
    primePoolPath(fakes, { documents: [DOCUMENT_FILE], images: [IMAGE_FILE] });

    const result = await fakes.evaluationService.collectContext({ entityType: 'pool', entityId: 'pool-1' });

    expect(result.context).toContain('Pool name: Solar Farm');
    expect(result.context).toContain('Business name: Acme Renewables');
    expect(result.files.map((file) => file.id)).toEqual(['doc-1', 'img-1']);
    expect(result.ownerId).toBe('owner-1');
    expect(result.ownerType).toBe('business');
    expect(result.grandParentId).toBe('business-1');
  });

  test('a business that is not deployed is rejected before any read', async () => {
    const fakes = setup();
    primeBusinessPath(fakes);
    fakes.eden.rwaClient.getBusiness.setDefaultResponse(edenOk({ ...BUSINESS, tokenAddress: undefined }));

    const error: any = await fakes.evaluationService
      .collectContext({ entityType: 'business', entityId: 'business-1' })
      .catch((thrown) => thrown);

    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('NOT_DEPLOYED');
    expect(fakes.eden.documentsClient.getDocuments.post).toHaveBeenCalledTimes(0);
  });

  test('a failed upstream read is mapped to 502', async () => {
    const fakes = setup();
    primePoolPath(fakes);
    fakes.eden.documentsClient.getDocuments.setDefaultResponse({ data: null, error: { status: 500 } });

    const error: any = await fakes.evaluationService
      .collectContext({ entityType: 'pool', entityId: 'pool-1' })
      .catch((thrown) => thrown);

    expect(error.statusCode).toBe(502);
    expect(error.code).toBe('UPSTREAM_ERROR');
  });
});

describe('EvaluationService.selectFiles', () => {
  test('without files the model is not called', async () => {
    const fakes = setup();

    const result = await fakes.evaluationService.selectFiles({ context: 'context', files: [] });

    expect(result.selectedFiles).toEqual([]);
    expect(fakes.openRouterClient.chatCompletion).toHaveBeenCalledTimes(0);
  });

  test('picks the files the model asked for', async () => {
    const fakes = setup();
    fakes.openRouterClient.queueJsonResponse({ requestedDocuments: ['doc-1'], requestedImages: ['img-1'] });

    const result = await fakes.evaluationService.selectFiles({
      context: 'context',
      files: [
        { ...DOCUMENT_FILE },
        { id: IMAGE_FILE.id, name: IMAGE_FILE.name, mimeType: 'image/jpeg', url: IMAGE_FILE.url },
      ],
    });

    expect(result.selectedFiles.map((file) => file.id)).toEqual(['doc-1', 'img-1']);
  });

  test('an unknown id from the model is rejected with 400', async () => {
    const fakes = setup();
    fakes.openRouterClient.queueJsonResponse({ requestedDocuments: ['missing'] });

    const error: any = await fakes.evaluationService
      .selectFiles({ context: 'context', files: [{ ...DOCUMENT_FILE }] })
      .catch((thrown) => thrown);

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('NOT_FOUND');
  });
});

describe('EvaluationService.summarize', () => {
  test('returns the summary of the model', async () => {
    const fakes = setup();
    fakes.openRouterClient.queueResponse(SUMMARY);

    const result = await fakes.evaluationService.summarize({
      context: 'context',
      selectedFiles: [{ ...DOCUMENT_FILE }],
    });

    expect(result.summary).toBe(SUMMARY);
  });

  test('an empty summary is an error', async () => {
    const fakes = setup();
    fakes.openRouterClient.queueResponse('');

    const error: any = await fakes.evaluationService
      .summarize({ context: 'context', selectedFiles: [{ ...DOCUMENT_FILE }] })
      .catch((thrown) => thrown);

    expect(error.statusCode).toBe(502);
    expect(error.code).toBe('AI_ERROR');
  });

  test('more files than allowed is a validation error', async () => {
    const fakes = setup({ maxFilesPerRequest: 1 });

    const error: any = await fakes.evaluationService
      .summarize({ context: 'context', selectedFiles: [{ ...DOCUMENT_FILE }, { ...DOCUMENT_FILE, id: 'doc-2' }] })
      .catch((thrown) => thrown);

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(fakes.openRouterClient.chatCompletion).toHaveBeenCalledTimes(0);
  });
});

describe('EvaluationService.score', () => {
  test('returns the score, pros and cons', async () => {
    const fakes = setup();
    fakes.openRouterClient.queueJsonResponse(RISK);

    const result = await fakes.evaluationService.score({ summary: SUMMARY });

    expect(result.risk).toEqual(RISK);
  });

  test('a score outside 1..100 is an error', async () => {
    const fakes = setup();
    fakes.openRouterClient.queueJsonResponse({ score: 0, pros: [], cons: [] });

    const error: any = await fakes.evaluationService.score({ summary: SUMMARY }).catch((thrown) => thrown);

    expect(error.statusCode).toBe(502);
    expect(error.code).toBe('AI_ERROR');
  });
});

describe('EvaluationService.save', () => {
  const SAVE_PARAMS = {
    evaluationId: new Types.ObjectId().toString(),
    entityType: 'pool' as const,
    entityId: 'pool-1',
    ownerId: 'owner-1',
    ownerType: 'business',
    grandParentId: 'business-1',
    summary: SUMMARY,
    selectedFiles: [{ ...DOCUMENT_FILE }],
    risk: RISK,
  };

  test('creates the evaluation with the given id and publishes the result', async () => {
    const fakes = setup();

    const result = await fakes.evaluationService.save(SAVE_PARAMS);

    const stored = fakes.evaluationRepository.store.get(SAVE_PARAMS.evaluationId);

    expect(result.evaluationId).toBe(SAVE_PARAMS.evaluationId);
    expect(stored?.summary).toBe(SUMMARY);
    expect(stored?.sources).toEqual([
      { type: 'document', id: 'doc-1', name: 'Pitch deck.pdf', mimeType: 'application/pdf' },
    ]);
    expect(fakes.outbox.published[0]).toMatchObject({ entityId: 'pool-1', riskScore: 42 });
  });

  test('a repeated save does not create or publish anything twice', async () => {
    const fakes = setup();
    await fakes.evaluationService.save(SAVE_PARAMS);

    await fakes.evaluationService.save(SAVE_PARAMS);

    expect(fakes.evaluationRepository.store.size).toBe(1);
    expect(fakes.outbox.publish).toHaveBeenCalledTimes(1);
  });
});

describe('EvaluationService.getAvailability', () => {
  test('without evaluations the request is available', async () => {
    const fakes = setup({ cooldownSeconds: 86_400 });
    fakes.eden.rwaClient.getPool.setDefaultResponse(edenOk(POOL));

    const result = await fakes.evaluationService.getAvailability({ entityType: 'pool', entityId: 'pool-1' });

    expect(result).toEqual({ available: true, cooldownLeft: 0 });
  });

  test('a recent evaluation blocks the request and reports the remaining seconds', async () => {
    const fakes = setup({ cooldownSeconds: 86_400 });
    fakes.eden.rwaClient.getPool.setDefaultResponse(edenOk(POOL));
    await seedEvaluation(fakes);

    const result = await fakes.evaluationService.getAvailability({ entityType: 'pool', entityId: 'pool-1' });

    expect(result.available).toBe(false);
    expect(result.cooldownLeft).toBeGreaterThan(86_000);
  });

  test('rejects a pool that is not deployed', async () => {
    const fakes = setup();
    fakes.eden.rwaClient.getPool.setDefaultResponse(edenOk({ ...POOL, poolAddress: undefined }));

    const error: any = await fakes.evaluationService
      .getAvailability({ entityType: 'pool', entityId: 'pool-1' })
      .catch((thrown) => thrown);

    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('NOT_DEPLOYED');
  });

  test('rejects a business that is not deployed', async () => {
    const fakes = setup();
    fakes.eden.rwaClient.getBusiness.setDefaultResponse(edenOk({ ...BUSINESS, tokenAddress: undefined }));

    const error: any = await fakes.evaluationService
      .getAvailability({ entityType: 'business', entityId: 'business-1' })
      .catch((thrown) => thrown);

    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('NOT_DEPLOYED');
  });
});

describe('EvaluationService reads', () => {
  test('getEvaluation maps the stored document', async () => {
    const fakes = setup();
    const seeded = await seedEvaluation(fakes);

    const evaluation = await fakes.evaluationService.getEvaluation({ id: seeded._id.toString() });

    expect(evaluation.risk).toEqual(RISK);
    expect(evaluation.summary).toBe(SUMMARY);
  });

  test('getEvaluations maps every document', async () => {
    const fakes = setup();
    await seedEvaluation(fakes);

    const evaluations = await fakes.evaluationService.getEvaluations({ filter: { parentId: 'pool-1' } });

    expect(evaluations).toHaveLength(1);
    expect(evaluations[0].parentId).toBe('pool-1');
  });
});

beforeEach(() => {
  mock.restore();
});
