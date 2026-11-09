/**
 * Unit tests for the evaluator steps:
 *  - request(): deploy check, 24h cooldown, Evaluation + outbox request in one transaction
 *  - collectContext / selectFiles / summarize / score: self-contained steps with CAS
 *  - processEvaluation: linear chain, finalize in a transaction with the inbox commit
 *
 * Repositories and clients are in-memory fakes: no database, no broker, no network.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import mongoose from 'mongoose';
import { EvaluationService } from '../src/services/evaluation.service';
import type { EvaluationRepository } from '../src/repositories/evaluation.repository';
import type { EvaluationLockRepository } from '../src/repositories/evaluationLock.repository';
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
import { AppError } from '@shared/errors/app-errors';
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
const COOLDOWN_SECONDS = 24 * 60 * 60;

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

function createFakeLockRepository() {
  return { acquire: mock(async (_entityType: string, _parentId: string, _seconds: number): Promise<void> => {}) };
}

function setup(options: { maxFilesPerRequest?: number } = {}) {
  (mongoose.connection as unknown as { transaction: unknown }).transaction = async <T>(
    fn: () => Promise<T>,
  ): Promise<T> => fn();

  const evaluationRepository = createFakeEvaluationRepository();
  const evaluationLockRepository = createFakeLockRepository();
  const openRouterClient = createFakeOpenRouterClient();
  const eden = createFakeEdenClients();
  const outbox = createFakeOutboxPublisher();

  const evaluationService = new EvaluationService(
    evaluationRepository as unknown as EvaluationRepository,
    evaluationLockRepository as unknown as EvaluationLockRepository,
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
    false,
  );

  return { evaluationRepository, evaluationLockRepository, openRouterClient, eden, outbox, evaluationService };
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

async function seedEvaluation(fakes: Fakes, overrides: Record<string, unknown> = {}) {
  return fakes.evaluationRepository.create({
    entityType: 'pool',
    parentId: 'pool-1',
    ...overrides,
  });
}

describe('EvaluationService.request', () => {
  test('creates the evaluation and queues the evaluate request in one transaction', async () => {
    const fakes = setup();
    primePoolPath(fakes);

    const result = await fakes.evaluationService.request({ entityType: 'pool', entityId: 'pool-1' });

    expect(result.evaluationId).toMatch(/^[a-f0-9]{24}$/);
    expect(fakes.evaluationLockRepository.acquire).toHaveBeenCalledWith('pool', 'pool-1', COOLDOWN_SECONDS);
    expect(fakes.evaluationRepository.create).toHaveBeenCalledTimes(1);
    expect(fakes.outbox.publish).toHaveBeenCalledWith(
      'evaluation.requests',
      'evaluate',
      { evaluationId: result.evaluationId, entityType: 'pool', entityId: 'pool-1' },
      result.evaluationId,
    );
    expect(fakes.evaluationRepository.store.get(result.evaluationId)?.completed).toBe(false);
  });

  test('rejects a pool that is not deployed before touching the lock', async () => {
    const fakes = setup();
    fakes.eden.rwaClient.getPool.setDefaultResponse(edenOk({ ...POOL, poolAddress: undefined }));

    const error: any = await fakes.evaluationService
      .request({ entityType: 'pool', entityId: 'pool-1' })
      .catch((thrown) => thrown);

    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('NOT_DEPLOYED');
    expect(fakes.evaluationLockRepository.acquire).toHaveBeenCalledTimes(0);
    expect(fakes.evaluationRepository.create).toHaveBeenCalledTimes(0);
  });

  test('rejects a business that is not deployed', async () => {
    const fakes = setup();
    fakes.eden.rwaClient.getBusiness.setDefaultResponse(edenOk({ ...BUSINESS, tokenAddress: undefined }));

    const error: any = await fakes.evaluationService
      .request({ entityType: 'business', entityId: 'business-1' })
      .catch((thrown) => thrown);

    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('NOT_DEPLOYED');
  });

  test('a request inside the cooldown window fails on the lock and creates nothing', async () => {
    const fakes = setup();
    primePoolPath(fakes);
    fakes.evaluationLockRepository.acquire.mockImplementationOnce(async () => {
      throw new AppError({
        message: 'Evaluation cooldown is active',
        statusCode: 429,
        code: 'EVALUATION_COOLDOWN',
      });
    });

    const error: any = await fakes.evaluationService
      .request({ entityType: 'pool', entityId: 'pool-1' })
      .catch((thrown) => thrown);

    expect(error.statusCode).toBe(429);
    expect(error.code).toBe('EVALUATION_COOLDOWN');
    expect(fakes.evaluationRepository.create).toHaveBeenCalledTimes(0);
    expect(fakes.outbox.publish).toHaveBeenCalledTimes(0);
  });
});

describe('EvaluationService.collectContext', () => {
  test('a pool gathers its own and the business data, plus the files of the documents and gallery', async () => {
    const fakes = setup();
    primePoolPath(fakes, { documents: [DOCUMENT_FILE], images: [IMAGE_FILE] });
    const evaluation = await seedEvaluation(fakes);

    const result = await fakes.evaluationService.collectContext(evaluation);

    expect(result.text).toContain('Pool name: Solar Farm');
    expect(result.text).toContain('Business name: Acme Renewables');
    expect(result.files.map((file) => file.id)).toEqual(['doc-1', 'img-1']);

    const stored = fakes.evaluationRepository.store.get(evaluation._id.toString());
    expect(stored?.ownerId).toBe('owner-1');
    expect(stored?.ownerType).toBe('business');
    expect(stored?.grandParentId).toBe('business-1');
    expect(stored?.context?.text).toContain('Pool name: Solar Farm');
  });

  test('a stored context is returned without any upstream read', async () => {
    const fakes = setup();
    const evaluation = await seedEvaluation(fakes, {
      context: { text: 'stored', files: [DOCUMENT_FILE] },
    });

    const result = await fakes.evaluationService.collectContext(evaluation);

    expect(result).toEqual({ text: 'stored', files: [DOCUMENT_FILE] });
    expect(fakes.eden.rwaClient.getPool.post).toHaveBeenCalledTimes(0);
  });

  test('a business that is not deployed is rejected before any read', async () => {
    const fakes = setup();
    primeBusinessPath(fakes);
    fakes.eden.rwaClient.getBusiness.setDefaultResponse(edenOk({ ...BUSINESS, tokenAddress: undefined }));
    const evaluation = await seedEvaluation(fakes, { entityType: 'business', parentId: 'business-1' });

    const error: any = await fakes.evaluationService.collectContext(evaluation).catch((thrown) => thrown);

    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('NOT_DEPLOYED');
    expect(fakes.eden.documentsClient.getDocuments.post).toHaveBeenCalledTimes(0);
  });

  test('a failed upstream read is mapped to 502', async () => {
    const fakes = setup();
    primePoolPath(fakes);
    fakes.eden.documentsClient.getDocuments.setDefaultResponse({ data: null, error: { status: 500 } });
    const evaluation = await seedEvaluation(fakes);

    const error: any = await fakes.evaluationService.collectContext(evaluation).catch((thrown) => thrown);

    expect(error.statusCode).toBe(502);
    expect(error.code).toBe('UPSTREAM_ERROR');
  });

  test('a lost CAS is a step conflict', async () => {
    const fakes = setup();
    primePoolPath(fakes);
    const evaluation = await seedEvaluation(fakes);
    fakes.evaluationRepository.fillContext.mockImplementationOnce(async () => null);

    const error: any = await fakes.evaluationService.collectContext(evaluation).catch((thrown) => thrown);

    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('EVALUATION_STEP_CONFLICT');
  });
});

describe('EvaluationService.selectFiles', () => {
  test('without files the model is not called and the empty selection is stored', async () => {
    const fakes = setup();
    const evaluation = await seedEvaluation(fakes);

    const result = await fakes.evaluationService.selectFiles(evaluation, { text: 'context', files: [] });

    expect(result).toEqual([]);
    expect(fakes.openRouterClient.chatCompletion).toHaveBeenCalledTimes(0);
    expect(fakes.evaluationRepository.store.get(evaluation._id.toString())?.selection).toEqual({ files: [] });
  });

  test('picks the files the model asked for', async () => {
    const fakes = setup();
    fakes.openRouterClient.queueJsonResponse({ requestedDocuments: ['doc-1'], requestedImages: ['img-1'] });
    const evaluation = await seedEvaluation(fakes);

    const result = await fakes.evaluationService.selectFiles(evaluation, {
      text: 'context',
      files: [
        { ...DOCUMENT_FILE },
        { id: IMAGE_FILE.id, name: IMAGE_FILE.name, mimeType: 'image/jpeg', url: IMAGE_FILE.url },
      ],
    });

    expect(result.map((file) => file.id)).toEqual(['doc-1', 'img-1']);
    expect(fakes.evaluationRepository.store.get(evaluation._id.toString())?.selection?.files).toHaveLength(2);
  });

  test('an unknown id from the model is dropped, not treated as an error', async () => {
    const fakes = setup();
    fakes.openRouterClient.queueJsonResponse({ requestedDocuments: ['missing', 'doc-1'] });
    const evaluation = await seedEvaluation(fakes);

    const result = await fakes.evaluationService.selectFiles(evaluation, {
      text: 'context',
      files: [{ ...DOCUMENT_FILE }],
    });

    expect(result.map((file) => file.id)).toEqual(['doc-1']);
  });
});

describe('EvaluationService.summarize', () => {
  test('returns the summary of the model and stores it', async () => {
    const fakes = setup();
    fakes.openRouterClient.queueResponse(SUMMARY);
    const evaluation = await seedEvaluation(fakes);

    const result = await fakes.evaluationService.summarize(
      evaluation,
      { text: 'context', files: [] },
      [{ ...DOCUMENT_FILE }],
    );

    expect(result).toBe(SUMMARY);
    expect(fakes.evaluationRepository.store.get(evaluation._id.toString())?.summary).toBe(SUMMARY);
  });

  test('an empty summary is an error', async () => {
    const fakes = setup();
    fakes.openRouterClient.queueResponse('');
    const evaluation = await seedEvaluation(fakes);

    const error: any = await fakes.evaluationService
      .summarize(evaluation, { text: 'context', files: [] }, [{ ...DOCUMENT_FILE }])
      .catch((thrown) => thrown);

    expect(error.statusCode).toBe(502);
    expect(error.code).toBe('AI_ERROR');
  });

  test('more files than allowed is a validation error', async () => {
    const fakes = setup({ maxFilesPerRequest: 1 });
    const evaluation = await seedEvaluation(fakes);

    const error: any = await fakes.evaluationService
      .summarize(evaluation, { text: 'context', files: [] }, [
        { ...DOCUMENT_FILE },
        { ...DOCUMENT_FILE, id: 'doc-2' },
      ])
      .catch((thrown) => thrown);

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(fakes.openRouterClient.chatCompletion).toHaveBeenCalledTimes(0);
  });
});

describe('EvaluationService.score', () => {
  test('returns the score, pros and cons and stores them', async () => {
    const fakes = setup();
    fakes.openRouterClient.queueJsonResponse(RISK);
    const evaluation = await seedEvaluation(fakes);

    const result = await fakes.evaluationService.score(evaluation, SUMMARY);

    expect(result).toEqual(RISK);
    expect(fakes.evaluationRepository.store.get(evaluation._id.toString())?.risk).toEqual(RISK);
  });

  test('a score outside 1..100 is an error', async () => {
    const fakes = setup();
    fakes.openRouterClient.queueJsonResponse({ score: 0, pros: [], cons: [] });
    const evaluation = await seedEvaluation(fakes);

    const error: any = await fakes.evaluationService.score(evaluation, SUMMARY).catch((thrown) => thrown);

    expect(error.statusCode).toBe(502);
    expect(error.code).toBe('AI_ERROR');
  });
});

describe('EvaluationService.processEvaluation', () => {
  test('runs every step, finalizes and publishes the result before committing the inbox', async () => {
    const fakes = setup();
    primePoolPath(fakes, { documents: [DOCUMENT_FILE] });
    const evaluation = await seedEvaluation(fakes);
    const commitInbox = mock(async () => {});

    fakes.openRouterClient.queueJsonResponse({ requestedDocuments: ['doc-1'] });
    fakes.openRouterClient.queueResponse(SUMMARY);
    fakes.openRouterClient.queueJsonResponse(RISK);

    await fakes.evaluationService.processEvaluation({ evaluationId: evaluation._id.toString() }, commitInbox);

    const stored = fakes.evaluationRepository.store.get(evaluation._id.toString());
    expect(stored?.completed).toBe(true);
    expect(stored?.summary).toBe(SUMMARY);
    expect(stored?.risk).toEqual(RISK);
    expect(stored?.sources).toEqual([
      { type: 'document', id: 'doc-1', name: 'Pitch deck.pdf', mimeType: 'application/pdf' },
    ]);
    expect(commitInbox).toHaveBeenCalledTimes(1);
    expect(fakes.outbox.publish).toHaveBeenCalledWith(
      'evaluation.results',
      'poolResult',
      { evaluationId: evaluation._id.toString(), entityType: 'pool', entityId: 'pool-1', riskScore: 42 },
      evaluation._id.toString(),
    );
  });

  test('a finished evaluation only commits the inbox marker', async () => {
    const fakes = setup();
    const evaluation = await seedEvaluation(fakes);
    await fakes.evaluationRepository.finalize(evaluation._id.toString(), { sources: [], modelUsed: MODEL });
    const commitInbox = mock(async () => {});

    await fakes.evaluationService.processEvaluation({ evaluationId: evaluation._id.toString() }, commitInbox);

    expect(commitInbox).toHaveBeenCalledTimes(1);
    expect(fakes.openRouterClient.chatCompletion).toHaveBeenCalledTimes(0);
    expect(fakes.outbox.publish).toHaveBeenCalledTimes(0);
  });

  test('a step conflict aborts the pipeline before publishing anything', async () => {
    const fakes = setup();
    primePoolPath(fakes);
    const evaluation = await seedEvaluation(fakes);
    const commitInbox = mock(async () => {});
    fakes.evaluationRepository.fillContext.mockImplementationOnce(async () => null);

    const error: any = await fakes.evaluationService
      .processEvaluation({ evaluationId: evaluation._id.toString() }, commitInbox)
      .catch((thrown) => thrown);

    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('EVALUATION_STEP_CONFLICT');
    expect(commitInbox).toHaveBeenCalledTimes(0);
    expect(fakes.outbox.publish).toHaveBeenCalledTimes(0);
  });
});

describe('EvaluationService.finalize', () => {
  test('a lost CAS is a finalized conflict', async () => {
    const fakes = setup();
    const evaluation = await seedEvaluation(fakes);
    fakes.evaluationRepository.finalize.mockImplementationOnce(async () => null);

    const error: any = await fakes.evaluationService
      .finalize(evaluation, [], RISK, mock(async () => {}))
      .catch((thrown) => thrown);

    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('EVALUATION_ALREADY_FINALIZED');
  });
});

describe('EvaluationService reads', () => {
  test('getEvaluation maps the stored document', async () => {
    const fakes = setup();
    const seeded = await seedEvaluation(fakes, { summary: SUMMARY, risk: RISK });
    await fakes.evaluationRepository.finalize(seeded._id.toString(), { sources: [], modelUsed: MODEL });

    const evaluation = await fakes.evaluationService.getEvaluation({ id: seeded._id.toString() });

    expect(evaluation.risk).toEqual(RISK);
    expect(evaluation.summary).toBe(SUMMARY);
    expect(evaluation.completed).toBe(true);
    expect(evaluation.completedAt).toBe(evaluation.updatedAt);
  });

  test('an unfinished evaluation has completed false and no completedAt', async () => {
    const fakes = setup();
    const seeded = await seedEvaluation(fakes);

    const evaluation = await fakes.evaluationService.getEvaluation({ id: seeded._id.toString() });

    expect(evaluation.completed).toBe(false);
    expect(evaluation.completedAt).toBeUndefined();
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
