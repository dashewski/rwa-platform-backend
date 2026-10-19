/**
 * Unit tests for RiskEvaluationService.
 *
 * Scope: the service layer only. The evaluation repository and every injected
 * client (the six eden clients, OpenRouter and the evaluation results publisher)
 * are replaced with in-memory fakes (tests/fakes/*.fake.ts), so these tests need
 * no database, no broker and no network. The service is built with
 * `useBase64Files = false` so file URLs are forwarded as-is; the two base64 tests
 * stub global fetch explicitly.
 * Run with `bun test` from services/ai-evaluator.
 */
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import mongoose from 'mongoose';
import { RiskEvaluationService } from '../src/services/riskEvaluation.service';
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
import {
  createFakeEvaluationRepository,
  type CreateEvaluationInput,
  type FakeEvaluationRepository,
} from './fakes/evaluation.repository.fake';
import {
  createFakeEdenClients,
  edenError,
  edenOk,
  type FakeBusiness,
  type FakeDocumentFile,
  type FakeGalleryImage,
  type FakePool,
  type FakeQuestion,
} from './fakes/eden.clients.fake';
import { createFakeOpenRouterClient, type FakeChatCompletionRequest } from './fakes/openrouter.client.fake';
import { createFakeOutboxPublisher } from './fakes/outbox-publisher.fake';

const MODEL = 'test/model';

/** Well-formed (hex, 24 chars) but absent id: the repository casts ids before querying. */
const UNKNOWN_ID = '64b7f8f0f1f2f3f4f5f6f7a8';

const POOL_PARAMS = { poolId: 'pool-1', ownerId: 'owner-1', ownerType: 'business' };
const BUSINESS_PARAMS = { businessId: 'business-1', ownerId: 'owner-1', ownerType: 'business' };

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
  riskScore: 88,
};

const SIBLING_POOL: FakePool = {
  id: 'pool-2',
  name: 'Wind Farm B',
  businessId: 'business-1',
  poolAddress: '0xsibling-address',
  riskScore: 77,
};

const BUSINESS: FakeBusiness = {
  id: 'business-1',
  name: 'Acme Renewables',
  businessType: 'energy',
  country: 'DE',
  tags: ['energy', 'solar'],
};

const DOCUMENT_FILE: FakeDocumentFile = {
  id: 'doc-1',
  name: 'Pitch deck.pdf',
  mimeType: 'application/pdf',
  url: 'https://files.local/pitch-deck.pdf',
};

const OTHER_DOCUMENT_FILE: FakeDocumentFile = {
  id: 'doc-2',
  name: 'Financials.pdf',
  mimeType: 'application/pdf',
  url: 'https://files.local/financials.pdf',
};

const IMAGE_FILE: FakeGalleryImage = {
  id: 'img-1',
  name: 'Storefront.jpg',
  url: 'https://files.local/storefront.jpg',
};

const SECOND_IMAGE_FILE: FakeGalleryImage = {
  id: 'img-2',
  name: 'Second.jpg',
  url: 'https://files.local/second.jpg',
};

/** Public URL of an internal file: urlToBase64() rewrites rwa.local to the nginx host. */
const INTERNAL_IMAGE_FILE: FakeGalleryImage = {
  id: 'img-local',
  name: 'Local.jpg',
  url: 'https://rwa.local/files/local.jpg',
};

const ANSWERED_QUESTION: FakeQuestion = { id: 'question-1', answered: true };
const UNANSWERED_QUESTION: FakeQuestion = { id: 'question-2', answered: false };

const INVESTOR_BALANCE = { poolAddress: '0xpool-address', investorId: 'investor-1' };

type SetupOptions = {
  maxFilesPerRequest?: number;
  useBase64Files?: boolean;
};

function createFakeEvaluationJobRepository() {
  return {
    enqueue: mock(async () => undefined),
    releaseProcessing: mock(async () => undefined),
    claimNext: mock(async () => null),
    markDone: mock(async () => undefined),
    markAttemptFailed: mock(async () => null),
  };
}

function setup(options: SetupOptions = {}) {
  const evaluationRepository: FakeEvaluationRepository = createFakeEvaluationRepository();
  const openRouterClient = createFakeOpenRouterClient();
  const eden = createFakeEdenClients();
  const outbox = createFakeOutboxPublisher();
  const evaluationJobRepository = createFakeEvaluationJobRepository();

  const service = new RiskEvaluationService(
    evaluationRepository as unknown as EvaluationRepository,
    evaluationJobRepository as never,
    openRouterClient as unknown as OpenRouterClient,
    eden.rwaClient as unknown as RwaClient,
    eden.documentsClient as unknown as DocumentsClient,
    eden.galleryClient as unknown as GalleryClient,
    eden.reactionsClient as unknown as ReactionsClient,
    eden.questionsClient as unknown as QuestionsClient,
    eden.portfolioClient as unknown as PortfolioClient,
    outbox as unknown as OutboxPublisherService,
    'evaluation',
    MODEL,
    options.maxFilesPerRequest ?? 20,
    options.useBase64Files ?? false,
  );

  return { service, evaluationRepository, evaluationJobRepository, openRouterClient, outbox, ...eden };
}

type Fakes = ReturnType<typeof setup>;

type PrimeOptions = {
  pool?: FakePool;
  business?: FakeBusiness;
  siblingPools?: FakePool[];
  documents?: FakeDocumentFile[];
  images?: FakeGalleryImage[];
  reactions?: Record<string, number>;
  questions?: FakeQuestion[];
  balances?: Record<string, unknown>[];
};

/** Primes every client with a successful response; tests override what they care about. */
function primePoolPath(fakes: Fakes, options: PrimeOptions = {}) {
  const pool = options.pool ?? POOL;

  fakes.rwaClient.getPool.setDefaultResponse(edenOk(pool));
  fakes.rwaClient.getBusiness.setDefaultResponse(edenOk(options.business ?? BUSINESS));
  fakes.rwaClient.getPools.setDefaultResponse(edenOk(options.siblingPools ?? [pool, SIBLING_POOL]));
  fakes.documentsClient.getDocuments.setDefaultResponse(edenOk(options.documents ?? []));
  fakes.galleryClient.getImages.setDefaultResponse(edenOk(options.images ?? []));
  fakes.reactionsClient.getEntityReactions.setDefaultResponse(
    edenOk({ reactions: options.reactions ?? { like: 3, dislike: 1 } }),
  );
  fakes.questionsClient.getQuestions.setDefaultResponse(
    edenOk(options.questions ?? [ANSWERED_QUESTION, UNANSWERED_QUESTION]),
  );
  fakes.portfolioClient.getBalances.setDefaultResponse(edenOk(options.balances ?? [INVESTOR_BALANCE]));
}

type FakeContentPart = {
  type: string;
  text?: string;
  file?: { filename: string; fileData: string };
  imageUrl?: { url: string };
};

function chatRequest(fakes: Fakes, index = 0): FakeChatCompletionRequest {
  return fakes.openRouterClient.chatCompletion.mock.calls[index][0];
}

function contentParts(request: FakeChatCompletionRequest, messageIndex = 0): FakeContentPart[] {
  return request.messages[messageIndex].content as FakeContentPart[];
}

function createPayload(fakes: Fakes): CreateEvaluationInput {
  return fakes.evaluationRepository.create.mock.calls[0][0];
}

function evaluationId(fakes: Fakes): string {
  return [...fakes.evaluationRepository.store.keys()][0];
}

function seedEvaluation(fakes: Fakes, input: Partial<CreateEvaluationInput> = {}) {
  return fakes.evaluationRepository.create({
    entityType: 'pool',
    parentId: 'pool-1',
    grandParentId: 'business-1',
    ownerId: 'owner-1',
    ownerType: 'business',
    factors: [],
    evaluatedDocuments: [],
    evaluatedImages: [],
    ...input,
  });
}

describe('RiskEvaluationService (unit, fake repository and clients)', () => {
  let fakes: Fakes;
  let originalTransaction: unknown;

  beforeEach(() => {
    // evaluate* writes the document and its outbox record in one transaction.
    originalTransaction = (mongoose.connection as unknown as { transaction: unknown }).transaction;
    (mongoose.connection as unknown as { transaction: unknown }).transaction = async <T>(fn: () => Promise<T>) =>
      await fn();

    fakes = setup();
  });

  afterEach(() => {
    (mongoose.connection as unknown as { transaction: unknown }).transaction = originalTransaction;
  });

  describe('evaluatePool', () => {
    test('fetches pool and business, then stores the finished evaluation and queues the result', async () => {
      primePoolPath(fakes, {
        documents: [DOCUMENT_FILE, OTHER_DOCUMENT_FILE],
        images: [IMAGE_FILE],
      });
      const selectionContent = JSON.stringify({ requestedDocuments: ['doc-1'], requestedImages: ['img-1'] });
      const riskContent = JSON.stringify({
        riskScore: 42,
        reasoning: 'Low risk',
        factors: [{ name: 'Revenue', impact: 'positive', detail: 'Paying customers' }],
      });
      fakes.openRouterClient.queueResponse(selectionContent);
      fakes.openRouterClient.queueResponse(riskContent);

      await fakes.service.evaluatePool(POOL_PARAMS);

      expect(fakes.rwaClient.getPool.post).toHaveBeenCalledTimes(1);
      expect(fakes.rwaClient.getPool.post).toHaveBeenCalledWith({ id: 'pool-1' });
      expect(fakes.rwaClient.getBusiness.post).toHaveBeenCalledWith({ id: 'business-1' });

      expect(fakes.evaluationRepository.create).toHaveBeenCalledTimes(1);
      expect(createPayload(fakes)).toEqual({
        entityType: 'pool',
        parentId: 'pool-1',
        grandParentId: 'business-1',
        ownerId: 'owner-1',
        ownerType: 'business',
        // One insert with the finished result: no pending document any more.
        riskScore: 42,
        reasoning: 'Low risk',
        factors: [{ name: 'Revenue', impact: 'positive', detail: 'Paying customers' }],
        stage1Response: selectionContent,
        stage2Response: riskContent,
        evaluatedDocuments: [{ id: 'doc-1', name: 'Pitch deck.pdf', mimeType: 'application/pdf' }],
        evaluatedImages: [{ id: 'img-1', name: 'Storefront.jpg' }],
        modelUsed: MODEL,
      });

      const id = evaluationId(fakes);
      expect(fakes.evaluationRepository.updateById).toHaveBeenCalledTimes(0);

      expect(fakes.outbox.publish).toHaveBeenCalledTimes(1);
      expect(fakes.outbox.publish).toHaveBeenCalledWith(
        'evaluation',
        'poolResult',
        { evaluationId: id, entityType: 'pool', entityId: 'pool-1', riskScore: 42 },
        id,
      );

      expect(fakes.evaluationRepository.store.get(id)!.riskScore).toBe(42);
    });

    test('queries every module with the right payloads', async () => {
      primePoolPath(fakes, { documents: [DOCUMENT_FILE], images: [IMAGE_FILE] });
      fakes.openRouterClient.queueJsonResponse({ requestedDocuments: [], requestedImages: [] });

      await fakes.service.evaluatePool(POOL_PARAMS);

      expect(fakes.rwaClient.getPools.post).toHaveBeenCalledWith({ filter: { businessId: 'business-1' } });
      expect(fakes.documentsClient.getDocuments.post).toHaveBeenCalledWith({ filter: { parentId: 'pool-1' } });
      expect(fakes.galleryClient.getImages.post).toHaveBeenCalledWith({ filter: { parentId: 'pool-1' } });
      expect(fakes.reactionsClient.getEntityReactions.post).toHaveBeenCalledWith({
        parentId: 'pool-1',
        parentType: 'pool',
      });
      expect(fakes.questionsClient.getQuestions.post).toHaveBeenCalledWith({ filter: { parentId: 'pool-1' } });
      expect(fakes.portfolioClient.getBalances.post).toHaveBeenCalledWith({
        filter: { poolAddress: '0xpool-address' },
      });
    });

    test('composes the summary of every module into the risk prompt', async () => {
      primePoolPath(fakes);
      fakes.openRouterClient.queueJsonResponse({ riskScore: 42, reasoning: 'Low risk', factors: [] });

      await fakes.service.evaluatePool(POOL_PARAMS);

      // No files were returned by the modules, so only the risk (stage 2) call happens.
      expect(fakes.openRouterClient.chatCompletion).toHaveBeenCalledTimes(1);

      const request = chatRequest(fakes);
      expect(request.model).toBe(MODEL);
      expect(request.messages[0].role).toBe('user');

      const [summaryPart, instructionsPart] = contentParts(request);
      expect(summaryPart.type).toBe('text');
      const summary = summaryPart.text as string;

      expect(summary).toContain('Entity type: pool');
      expect(summary).toContain('Pool name: Solar Farm');
      expect(summary).toContain('Pool description: A community solar farm');
      expect(summary).toContain('Pool tags: energy, green');
      expect(summary).toContain('Entry fee: 1');
      expect(summary).toContain('Business name: Acme Renewables');
      expect(summary).toContain('Tags: energy, solar');
      expect(summary).toContain('Sibling pools:\n- Wind Farm B: riskScore=77, deployed=true');
      // The evaluated pool itself is excluded from its sibling list.
      expect(summary).not.toContain('- Solar Farm:');
      expect(summary).toContain('Documents: none exist');
      expect(summary).toContain('Images: none exist');
      expect(summary).toContain('Reactions: like: 3, dislike: 1');
      expect(summary).toContain('Q&A: 2 questions, 1 answered');
      expect(summary).toContain('Portfolio: 1 investors');

      expect(instructionsPart.type).toBe('text');
      expect(instructionsPart.text).toContain('Please evaluate the risk of this entity');
      expect(instructionsPart.text).toContain('riskScore must be an integer between 1 and 100. 0 is not allowed.');

      // Without attached files there is no file-selection stage: stage1Response stays empty.
      expect(createPayload(fakes).stage1Response).toBeUndefined();
      expect(createPayload(fakes).stage2Response).toBe(
        JSON.stringify({ riskScore: 42, reasoning: 'Low risk', factors: [] }),
      );
      expect(createPayload(fakes).evaluatedDocuments).toEqual([]);
      expect(fakes.outbox.publish).toHaveBeenCalledWith(
        'evaluation',
        'poolResult',
        {
          evaluationId: evaluationId(fakes),
          entityType: 'pool',
          entityId: 'pool-1',
          riskScore: 42,
        },
        evaluationId(fakes),
      );
    });

    test('skips the portfolio module when the pool has no address', async () => {
      const undeployedPool: FakePool = { ...POOL, poolAddress: undefined };
      primePoolPath(fakes, { pool: undeployedPool, siblingPools: [] });
      fakes.openRouterClient.queueJsonResponse({ riskScore: 42, reasoning: 'Low risk', factors: [] });

      await fakes.service.evaluatePool(POOL_PARAMS);

      expect(fakes.portfolioClient.getBalances.post).toHaveBeenCalledTimes(0);
      const summary = contentParts(chatRequest(fakes))[0].text as string;
      expect(summary).toContain('Sibling pools: none');
      expect(summary).not.toContain('Portfolio');
    });

    test('propagates UPSTREAM_ERROR when the rwa service cannot return the pool', async () => {
      primePoolPath(fakes);
      fakes.rwaClient.getPool.setDefaultResponse(edenError(500));

      await expect(fakes.service.evaluatePool(POOL_PARAMS)).rejects.toMatchObject({
        statusCode: 502,
        code: 'UPSTREAM_ERROR',
        message: 'Failed to fetch pool from rwa service',
      });

      expect(fakes.evaluationRepository.create).toHaveBeenCalledTimes(0);
      expect(fakes.outbox.publish).toHaveBeenCalledTimes(0);
    });

    test('treats a successful response without data as an upstream error', async () => {
      primePoolPath(fakes);
      fakes.rwaClient.getPool.setDefaultResponse({ data: null, error: null });

      await expect(fakes.service.evaluatePool(POOL_PARAMS)).rejects.toMatchObject({
        statusCode: 502,
        code: 'UPSTREAM_ERROR',
        message: 'Failed to fetch pool from rwa service',
      });
    });

    test('propagates UPSTREAM_ERROR when the business lookup fails', async () => {
      primePoolPath(fakes);
      fakes.rwaClient.getBusiness.setDefaultResponse(edenError(404));

      await expect(fakes.service.evaluatePool(POOL_PARAMS)).rejects.toMatchObject({
        statusCode: 502,
        code: 'UPSTREAM_ERROR',
        message: 'Failed to fetch business from rwa service',
      });

      // The pool was fetched, but no evaluation is created without its business.
      expect(fakes.rwaClient.getPool.post).toHaveBeenCalledTimes(1);
      expect(fakes.evaluationRepository.create).toHaveBeenCalledTimes(0);
    });

    test('a failing module aborts before any write (the failure event carries an empty id)', async () => {
      primePoolPath(fakes);
      fakes.documentsClient.getDocuments.setDefaultResponse(edenError(500));

      await expect(fakes.service.evaluatePool(POOL_PARAMS)).rejects.toMatchObject({
        statusCode: 502,
        code: 'UPSTREAM_ERROR',
        message: 'Failed to fetch documents from documents service',
      });

      // The document is only inserted once the LLM answered, so a module failure
      // leaves no row behind.
      expect(fakes.evaluationRepository.create).not.toHaveBeenCalled();
      expect(fakes.evaluationRepository.store.size).toBe(0);

      // Current behaviour: a module failure happens before the try/catch around
      // the insert, so no failure event is queued at all.
      expect(fakes.outbox.publish).not.toHaveBeenCalled();

      // Modules are started eagerly, so every client still got its call even though one failed.
      expect(fakes.rwaClient.getPools.post).toHaveBeenCalledTimes(1);
      expect(fakes.galleryClient.getImages.post).toHaveBeenCalledTimes(1);
      expect(fakes.reactionsClient.getEntityReactions.post).toHaveBeenCalledTimes(1);
      expect(fakes.questionsClient.getQuestions.post).toHaveBeenCalledTimes(1);
      expect(fakes.portfolioClient.getBalances.post).toHaveBeenCalledTimes(1);
      // The LLM is never asked once a module failed.
      expect(fakes.openRouterClient.chatCompletion).toHaveBeenCalledTimes(0);
    });

    test('secondary failures on the failure path do not mask the original error', async () => {
      primePoolPath(fakes);
      fakes.documentsClient.getDocuments.setDefaultResponse(edenError(500));
      // The real publisher / repository may fail too; the service swallows those two
      // errors (`.catch(() => {})`) so the caller still sees the original AppError.
      fakes.outbox.publish.mockRejectedValueOnce(new Error('broker down'));
      fakes.evaluationRepository.updateById.mockRejectedValueOnce(new Error('mongo down'));

      await expect(fakes.service.evaluatePool(POOL_PARAMS)).rejects.toMatchObject({
        statusCode: 502,
        code: 'UPSTREAM_ERROR',
        message: 'Failed to fetch documents from documents service',
      });
    });

    test('a publish failure propagates and nothing is queued', async () => {
      primePoolPath(fakes);
      fakes.openRouterClient.queueJsonResponse({ riskScore: 42, reasoning: 'Low risk', factors: [] });
      fakes.outbox.publish.mockRejectedValueOnce(new Error('broker down'));

      await expect(fakes.service.evaluatePool(POOL_PARAMS)).rejects.toThrow('broker down');

      // The transaction rolled back: no completed event, and there is no
      // failure event either (the outbox is the only channel).
      expect(fakes.outbox.published).toEqual([]);
    });
  });

  describe('file selection (stage 1)', () => {
    test('asks the LLM which files it wants and attaches only the requested ones', async () => {
      primePoolPath(fakes, { documents: [DOCUMENT_FILE, OTHER_DOCUMENT_FILE], images: [IMAGE_FILE] });
      const selectionContent = JSON.stringify({ requestedDocuments: ['doc-1'], requestedImages: ['img-1'] });
      fakes.openRouterClient.queueResponse(selectionContent);
      fakes.openRouterClient.queueJsonResponse({ riskScore: 30, reasoning: 'Mostly fine', factors: [] });

      await fakes.service.evaluatePool(POOL_PARAMS);

      expect(fakes.openRouterClient.chatCompletion).toHaveBeenCalledTimes(2);

      const selectionRequest = chatRequest(fakes, 0);
      expect(selectionRequest.model).toBe(MODEL);
      expect(selectionRequest.messages[0].role).toBe('system');
      expect(selectionRequest.messages[1]).toEqual({
        role: 'user',
        content: 'Which documents and images do you need for risk evaluation? Return JSON only.',
      });

      const systemMessage = selectionRequest.messages[0].content as string;
      expect(systemMessage).toContain('You are a risk assessment expert.');
      expect(systemMessage).toContain('decide which documents and images you need to study');
      expect(systemMessage).toContain('Available documents:');
      expect(systemMessage).toContain('- id=doc-1, name=Pitch deck.pdf, mimeType=application/pdf');
      expect(systemMessage).toContain('- id=doc-2, name=Financials.pdf, mimeType=application/pdf');
      expect(systemMessage).toContain('Available images:');
      expect(systemMessage).toContain('- id=img-1, name=Storefront.jpg');
      expect(systemMessage).toContain('"requestedDocuments": ["docId1", "docId3"],');
      expect(systemMessage).toContain('"requestedImages": ["imgId2"]');
      expect(systemMessage).toContain('Return JSON with the IDs of documents and images you want to examine:');

      const riskRequest = chatRequest(fakes, 1);
      const parts = contentParts(riskRequest);
      // summary + instructions + the requested document + the requested image (doc-2 was not asked for)
      expect(parts).toHaveLength(4);
      expect(parts[0].type).toBe('text');
      expect(parts[1].type).toBe('text');
      expect(parts[2]).toEqual({
        type: 'file',
        file: { filename: 'Pitch deck.pdf', fileData: 'https://files.local/pitch-deck.pdf' },
      });
      expect(parts[3]).toEqual({
        type: 'image_url',
        imageUrl: { url: 'https://files.local/storefront.jpg' },
      });

      expect(createPayload(fakes).stage1Response).toBe(selectionContent);
      expect(createPayload(fakes).evaluatedDocuments).toEqual([
        { id: 'doc-1', name: 'Pitch deck.pdf', mimeType: 'application/pdf' },
      ]);
      expect(createPayload(fakes).evaluatedImages).toEqual([{ id: 'img-1', name: 'Storefront.jpg' }]);
    });

    test('an empty selection reaches the risk prompt without attachments', async () => {
      primePoolPath(fakes, { documents: [DOCUMENT_FILE], images: [IMAGE_FILE] });
      fakes.openRouterClient.queueJsonResponse({ requestedDocuments: [], requestedImages: [] });
      fakes.openRouterClient.queueJsonResponse({ riskScore: 12, reasoning: 'Nothing needed', factors: [] });

      await fakes.service.evaluatePool(POOL_PARAMS);

      const parts = contentParts(chatRequest(fakes, 1));
      expect(parts).toHaveLength(2);
      expect(parts.map((part) => part.type)).toEqual(['text', 'text']);
      expect(createPayload(fakes).evaluatedDocuments).toEqual([]);
      expect(createPayload(fakes).evaluatedImages).toEqual([]);
      expect(createPayload(fakes).stage1Response).toBe(
        JSON.stringify({ requestedDocuments: [], requestedImages: [] }),
      );
    });

    test('with images only, the selection prompt talks about images only', async () => {
      primePoolPath(fakes, { images: [IMAGE_FILE] });
      fakes.openRouterClient.queueJsonResponse({ requestedImages: ['img-1'] });
      fakes.openRouterClient.queueJsonResponse({ riskScore: 61, reasoning: 'Image only', factors: [] });

      await fakes.service.evaluatePool(POOL_PARAMS);

      const selectionRequest = chatRequest(fakes, 0);
      expect(selectionRequest.messages[1]).toEqual({
        role: 'user',
        content: 'Which images do you need for risk evaluation? Return JSON only.',
      });

      const systemMessage = selectionRequest.messages[0].content as string;
      expect(systemMessage).toContain('decide which images you need to study');
      expect(systemMessage).toContain('Return JSON with the IDs of images you want to examine:');
      // The documents block of the JSON template is omitted when no documents exist.
      expect(systemMessage).not.toContain('requestedDocuments');
      expect(systemMessage).toContain('"requestedImages": ["imgId2"]');
    });

    test('rejects with NOT_FOUND (400) when the LLM requests an unknown document', async () => {
      primePoolPath(fakes, { documents: [DOCUMENT_FILE] });
      fakes.openRouterClient.queueJsonResponse({ requestedDocuments: ['doc-404'], requestedImages: [] });

      await expect(fakes.service.evaluatePool(POOL_PARAMS)).rejects.toMatchObject({
        statusCode: 400,
        code: 'NOT_FOUND',
        message: 'LLM requested document doc-404 but it was not found',
      });

      // Only the selection call happened; the risk call is never reached.
      expect(fakes.openRouterClient.chatCompletion).toHaveBeenCalledTimes(1);
      // The failure happens before the insert: no row, no event.
      expect(fakes.evaluationRepository.create).not.toHaveBeenCalled();
      expect(fakes.outbox.publish).not.toHaveBeenCalled();
    });

    test('rejects with NOT_FOUND (400) when the LLM requests an unknown image', async () => {
      primePoolPath(fakes, { images: [IMAGE_FILE] });
      fakes.openRouterClient.queueJsonResponse({ requestedDocuments: [], requestedImages: ['img-404'] });

      await expect(fakes.service.evaluatePool(POOL_PARAMS)).rejects.toMatchObject({
        statusCode: 400,
        code: 'NOT_FOUND',
        message: 'LLM requested image img-404 but it was not found',
      });
    });
  });

  describe('risk evaluation (stage 2)', () => {
    test('rejects with VALIDATION_ERROR when the selected files exceed maxFilesPerRequest', async () => {
      fakes = setup({ maxFilesPerRequest: 1 });
      primePoolPath(fakes, { images: [IMAGE_FILE, SECOND_IMAGE_FILE] });
      fakes.openRouterClient.queueJsonResponse({ requestedDocuments: [], requestedImages: ['img-1', 'img-2'] });

      await expect(fakes.service.evaluatePool(POOL_PARAMS)).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Too many files for OpenRouter request: 2. Maximum allowed: 1',
      });

      expect(fakes.openRouterClient.chatCompletion).toHaveBeenCalledTimes(1);
      expect(fakes.evaluationRepository.create).not.toHaveBeenCalled();
    });

    test('rejects a score that is not an integer between 1 and 100', async () => {
      for (const riskScore of [0, 101, 'high', undefined]) {
        fakes = setup();
        primePoolPath(fakes);
        fakes.openRouterClient.queueResponse(JSON.stringify({ riskScore, reasoning: 'Invalid score', factors: [] }));

        await expect(fakes.service.evaluatePool(POOL_PARAMS)).rejects.toMatchObject({
          statusCode: 502,
          code: 'AI_ERROR',
          message: `LLM returned invalid riskScore: ${riskScore}. Must be integer 1-100.`,
        });

        expect(fakes.evaluationRepository.create).not.toHaveBeenCalled();
      }
    });

    test('accepts JSON wrapped in a markdown code fence', async () => {
      primePoolPath(fakes);
      fakes.openRouterClient.queueResponse('```json\n{"riskScore": 77, "reasoning": "Fenced", "factors": []}\n```');

      await fakes.service.evaluatePool(POOL_PARAMS);

      expect(createPayload(fakes)).toMatchObject({ riskScore: 77, reasoning: 'Fenced' });
    });

    test('rejects with AI_ERROR when the LLM answer is not JSON', async () => {
      primePoolPath(fakes);
      fakes.openRouterClient.queueResponse('I cannot answer that.');

      await expect(fakes.service.evaluatePool(POOL_PARAMS)).rejects.toMatchObject({
        statusCode: 502,
        code: 'AI_ERROR',
        message: 'Failed to parse LLM response as JSON',
      });

      // The failure happens before the insert: no row, no event.
      expect(fakes.evaluationRepository.create).not.toHaveBeenCalled();
      expect(fakes.outbox.publish).not.toHaveBeenCalled();
    });

    test('embeds selected files as base64 data URLs when useBase64Files is enabled', async () => {
      fakes = setup({ useBase64Files: true });
      primePoolPath(fakes, { images: [INTERNAL_IMAGE_FILE] });
      fakes.openRouterClient.queueJsonResponse({ requestedDocuments: [], requestedImages: ['img-local'] });
      fakes.openRouterClient.queueJsonResponse({ riskScore: 55, reasoning: 'With image', factors: [] });

      const fetchedUrls: string[] = [];
      const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
        fetchedUrls.push(String(input));
        return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } });
      });

      try {
        await fakes.service.evaluatePool(POOL_PARAMS);
      } finally {
        fetchSpy.mockRestore();
      }

      // Internal files are downloaded through the nginx host, not the public rwa.local one.
      expect(fetchedUrls).toEqual(['https://nginx/files/local.jpg']);

      const parts = contentParts(chatRequest(fakes, 1));
      expect(parts[2]).toEqual({
        type: 'image_url',
        imageUrl: { url: 'data:image/jpeg;base64,AQID' },
      });
      expect(createPayload(fakes).evaluatedImages).toEqual([{ id: 'img-local', name: 'Local.jpg' }]);
    });

    test('rejects with UPSTREAM_ERROR when a file download fails', async () => {
      fakes = setup({ useBase64Files: true });
      primePoolPath(fakes, { images: [INTERNAL_IMAGE_FILE] });
      fakes.openRouterClient.queueJsonResponse({ requestedDocuments: [], requestedImages: ['img-local'] });

      const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
        async () => new Response(null, { status: 500, statusText: 'Internal Server Error' }),
      );

      try {
        await expect(fakes.service.evaluatePool(POOL_PARAMS)).rejects.toMatchObject({
          statusCode: 502,
          code: 'UPSTREAM_ERROR',
          message: 'Failed to fetch file for base64 conversion: 500 Internal Server Error',
        });
      } finally {
        fetchSpy.mockRestore();
      }

      expect(fakes.evaluationRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('evaluateBusiness', () => {
    test('creates a business evaluation without sibling pools or portfolio', async () => {
      fakes.rwaClient.getBusiness.setDefaultResponse(edenOk(BUSINESS));
      fakes.rwaClient.getPools.setDefaultResponse(edenOk<FakePool[]>([POOL]));
      fakes.questionsClient.getQuestions.setDefaultResponse(edenOk([ANSWERED_QUESTION]));
      fakes.openRouterClient.queueJsonResponse({ riskScore: 64, reasoning: 'Business risk', factors: [] });

      await fakes.service.evaluateBusiness(BUSINESS_PARAMS);

      // The pool fetch is exclusive to evaluatePool.
      expect(fakes.rwaClient.getPool.post).toHaveBeenCalledTimes(0);
      expect(createPayload(fakes)).toMatchObject({
        entityType: 'business',
        parentId: 'business-1',
        grandParentId: 'business-1',
        ownerId: 'owner-1',
        ownerType: 'business',
        // Stored already completed: one insert, no pending phase.
        riskScore: 64,
        reasoning: 'Business risk',
        factors: [],
        stage1Response: undefined,
        evaluatedDocuments: [],
        evaluatedImages: [],
        modelUsed: MODEL,
      });

      expect(fakes.rwaClient.getPools.post).toHaveBeenCalledWith({ filter: { businessId: 'business-1' } });
      expect(fakes.reactionsClient.getEntityReactions.post).toHaveBeenCalledWith({
        parentId: 'business-1',
        parentType: 'business',
      });
      expect(fakes.portfolioClient.getBalances.post).toHaveBeenCalledTimes(0);

      const summary = contentParts(chatRequest(fakes))[0].text as string;
      expect(summary).toContain('Pools of this business:\n- Solar Farm: riskScore=88, deployed=true');
      expect(summary).toContain('Business name: Acme Renewables');

      expect(createPayload(fakes)).toMatchObject({ riskScore: 64, stage1Response: undefined });
      expect(fakes.outbox.publish).toHaveBeenCalledWith(
        'evaluation',
        'businessResult',
        {
          evaluationId: evaluationId(fakes),
          entityType: 'business',
          entityId: 'business-1',
          riskScore: 64,
        },
        evaluationId(fakes),
      );
    });

    test('a failing module marks the business evaluation failed and publishes it', async () => {
      fakes.rwaClient.getBusiness.setDefaultResponse(edenOk(BUSINESS));
      fakes.rwaClient.getPools.setDefaultResponse(edenOk<FakePool[]>([POOL]));
      fakes.questionsClient.getQuestions.setDefaultResponse(edenError(500));

      await expect(fakes.service.evaluateBusiness(BUSINESS_PARAMS)).rejects.toMatchObject({
        statusCode: 502,
        code: 'UPSTREAM_ERROR',
        message: 'Failed to fetch questions from questions service',
      });

      // The failure happens before the insert: no row, no event.
      expect(fakes.evaluationRepository.create).not.toHaveBeenCalled();
      expect(fakes.outbox.publish).not.toHaveBeenCalled();
    });
  });

  describe('getEvaluation', () => {
    test('maps the mongo document to a plain JSON result', async () => {
      const created = await seedEvaluation(fakes, {
        riskScore: 42,
        reasoning: 'Low risk',
        factors: [{ name: 'Revenue', impact: 'positive', detail: 'Paying customers' }],
        stage1Response: '{"requestedDocuments":["doc-1"]}',
        stage2Response: '{"riskScore":42}',
        evaluatedDocuments: [{ id: 'doc-1', name: 'Pitch deck.pdf', mimeType: 'application/pdf' }],
        evaluatedImages: [{ id: 'img-1', name: 'Storefront.jpg' }],
        modelUsed: MODEL,
      });

      const evaluation = await fakes.service.getEvaluation({ id: created._id.toString() });

      expect(fakes.evaluationRepository.findById).toHaveBeenCalledWith(created._id.toString());
      expect(evaluation).toEqual({
        id: created._id.toString(),
        entityType: 'pool',
        parentId: 'pool-1',
        grandParentId: 'business-1',
        ownerId: 'owner-1',
        ownerType: 'business',
        riskScore: 42,
        reasoning: 'Low risk',
        factors: [{ name: 'Revenue', impact: 'positive', detail: 'Paying customers' }],
        stage1Response: '{"requestedDocuments":["doc-1"]}',
        stage2Response: '{"riskScore":42}',
        evaluatedDocuments: [{ id: 'doc-1', name: 'Pitch deck.pdf', mimeType: 'application/pdf' }],
        evaluatedImages: [{ id: 'img-1', name: 'Storefront.jpg' }],
        modelUsed: MODEL,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      });
      expect(evaluation).not.toHaveProperty('_id');
      // The result must be plain JSON — no ObjectId or class instances leaking to the caller.
      expect(JSON.parse(JSON.stringify(evaluation))).toEqual(evaluation);
    });

    test('maps an evaluation without result fields', async () => {
      const created = await seedEvaluation(fakes);

      const evaluation = await fakes.service.getEvaluation({ id: created._id.toString() });

      expect(evaluation.riskScore).toBeUndefined();
      expect(evaluation.reasoning).toBeUndefined();
      expect(evaluation.modelUsed).toBeUndefined();
      expect(evaluation.factors).toEqual([]);
      expect(evaluation.evaluatedDocuments).toEqual([]);
      expect(evaluation.evaluatedImages).toEqual([]);
    });

    test('propagates NOT_FOUND (404) for an unknown id', async () => {
      await expect(fakes.service.getEvaluation({ id: UNKNOWN_ID })).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: `Evaluation ${UNKNOWN_ID} not found`,
      });
    });
  });

  describe('getEvaluations', () => {
    test('forwards filter, sort and pagination and maps every result', async () => {
      const first = await seedEvaluation(fakes, { riskScore: 10 });
      const second = await seedEvaluation(fakes);
      await seedEvaluation(fakes, { parentId: 'pool-2', riskScore: 90 });

      const evaluations = await fakes.service.getEvaluations({
        filter: { parentId: 'pool-1' },
        sort: { createdAt: 'desc' },
        limit: 10,
        offset: 0,
      });

      expect(fakes.evaluationRepository.findAll).toHaveBeenCalledWith(
        { parentId: 'pool-1' },
        { createdAt: 'desc' },
        10,
        0,
      );
      expect(evaluations.map((evaluation) => evaluation.id)).toEqual([
        first._id.toString(),
        second._id.toString(),
      ]);
      expect(evaluations[0].riskScore).toBe(10);
      for (const evaluation of evaluations) expect(evaluation).not.toHaveProperty('_id');
    });

    test('defaults the pagination arguments when only a filter is given', async () => {
      await seedEvaluation(fakes);

      const evaluations = await fakes.service.getEvaluations({ filter: {} });

      expect(fakes.evaluationRepository.findAll).toHaveBeenCalledWith({}, undefined, undefined, undefined);
      expect(evaluations).toHaveLength(1);
    });

    test('returns an empty array when nothing matches', async () => {
      await seedEvaluation(fakes);

      const evaluations = await fakes.service.getEvaluations({ filter: { parentId: 'nobody' } });

      expect(evaluations).toEqual([]);
    });
  });
  describe('request guards', () => {
    // Body validation moved to the HTTP layer (Elysia schema in
    // create{Pool,Business}Evaluation.controller.ts), so the service has no
    // guard of its own any more: an empty payload fails at the rwa fetch.
    test('evaluatePool with an empty payload fails on the upstream fetch and writes nothing', async () => {
      const local = setup();

      await expect(local.service.evaluatePool({} as never)).rejects.toMatchObject({
        statusCode: 502,
        code: 'UPSTREAM_ERROR',
      });

      expect(local.evaluationRepository.create).toHaveBeenCalledTimes(0);
    });
  });
});