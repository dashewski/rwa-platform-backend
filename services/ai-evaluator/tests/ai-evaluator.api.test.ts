/**
 * Component tests for the ai-evaluator HTTP layer.
 *
 * The whole Elysia app is assembled in-process: real controllers and the real
 * RiskEvaluationService, with the evaluation repository replaced by an in-memory
 * fake and every injected client replaced by a fake as well (the endpoints only
 * read evaluations, so no client call is ever made). Requests go through
 * app.handle() — no port is bound, nothing is queried over the network.
 * Run with `bun test` from services/ai-evaluator.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { Elysia } from 'elysia';
import { ErrorHandlerPlugin } from '@shared/errors/error-handler.plugin';
import { createServicesPlugin } from '../src/plugins/services.plugin';
import { createControllersPlugin } from '../src/plugins/controllers.plugin';
import type { RepositoriesPlugin } from '../src/plugins/repositories.plugin';
import type { ClientsPlugin } from '../src/plugins/clients.plugin';
import {
  createFakeEvaluationRepository,
  type CreateEvaluationInput,
  type FakeEvaluationRepository,
} from './fakes/evaluation.repository.fake';
import {
  createFakeEvaluationJobRepository,
  type FakeEvaluationJobRepository,
} from './fakes/evaluationJob.repository.fake';
import { createFakeEdenClients } from './fakes/eden.clients.fake';
import { createFakeOpenRouterClient } from './fakes/openrouter.client.fake';
import { createFakeRabbitMQClient } from './fakes/rabbitmq.client.fake';

const MODEL = 'test/model';

/** Well-formed (hex, 24 chars) but absent id: the repository casts ids before querying. */
const UNKNOWN_ID = '64b7f8f0f1f2f3f4f5f6f7a8';

function buildApp(
  evaluationRepository: FakeEvaluationRepository,
  evaluationJobRepository: FakeEvaluationJobRepository,
  cooldownSeconds = 0,
) {
  const repositoriesPlugin = new Elysia({ name: 'Repositories' })
    .decorate('evaluationRepository', evaluationRepository)
    .decorate('evaluationJobRepository', evaluationJobRepository)
    .decorate('inboxConsumerMessageRepository', {
      runOnce: mock(async (_messageId: string, handler: () => Promise<unknown>) => handler()),
    })
    .decorate('outboxPublisherMessageRepository', {
      create: mock(async (doc: Record<string, unknown>) => ({ _id: 'outbox-1', ...doc })),
      releaseSending: mock(async (_exchange: string) => 0),
      markSent: mock(async (_id: unknown) => undefined),
      release: mock(async (_id: unknown) => undefined),
      claimNext: mock(async (_exchange: string) => null),
    });

  const eden = createFakeEdenClients();
  const clientsPlugin = new Elysia({ name: 'Clients' })
    .decorate('openRouterClient', createFakeOpenRouterClient())
    .decorate('rwaClient', eden.rwaClient)
    .decorate('documentsClient', eden.documentsClient)
    .decorate('galleryClient', eden.galleryClient)
    .decorate('reactionsClient', eden.reactionsClient)
    .decorate('questionsClient', eden.questionsClient)
    .decorate('portfolioClient', eden.portfolioClient)
    .decorate('rabbitMQClient', createFakeRabbitMQClient());

  const servicesPlugin = createServicesPlugin(
    repositoriesPlugin as unknown as RepositoriesPlugin,
    clientsPlugin as unknown as ClientsPlugin,
    MODEL,
    20,
    cooldownSeconds,
  );

  return new Elysia().onError(ErrorHandlerPlugin).use(createControllersPlugin(servicesPlugin));
}

type App = ReturnType<typeof buildApp>;

async function post(app: App, path: string, body: unknown) {
  const response = await app.handle(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

  return { status: response.status, body: (await response.json()) as any };
}

describe('ai-evaluator HTTP layer (component, fake repository and clients)', () => {
  let evaluationRepository: FakeEvaluationRepository;
  let evaluationJobRepository: FakeEvaluationJobRepository;
  let app: App;

  beforeEach(() => {
    evaluationRepository = createFakeEvaluationRepository();
    evaluationJobRepository = createFakeEvaluationJobRepository();
    app = buildApp(evaluationRepository, evaluationJobRepository);
  });

  /** Seeds a document through the repository fake so ids and timestamps come from the same store. */
  function seedEvaluation(input: Partial<CreateEvaluationInput> = {}) {
    return evaluationRepository.create({
      entityType: 'pool',
      parentId: 'pool-1',
      grandParentId: 'business-1',
      ownerId: 'owner-1',
      ownerType: 'business',
      summary: 'Acme Renewables operates a solar farm.',
      risk: { score: 42, pros: ['Long-term contract'], cons: ['No audit'] },
      sources: [{ type: 'document', id: 'doc-1', name: 'Pitch deck.pdf', mimeType: 'application/pdf' }],
      modelUsed: MODEL,
      ...input,
    });
  }

  test('getEvaluation: returns the stored evaluation without leaking the mongo document', async () => {
    const seeded = await seedEvaluation();

    const response = await post(app, '/getEvaluation', { id: seeded._id.toString() });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: seeded._id.toString(),
      entityType: 'pool',
      parentId: 'pool-1',
      grandParentId: 'business-1',
      ownerId: 'owner-1',
      ownerType: 'business',
      summary: 'Acme Renewables operates a solar farm.',
      risk: { score: 42, pros: ['Long-term contract'], cons: ['No audit'] },
      sources: [{ type: 'document', id: 'doc-1', name: 'Pitch deck.pdf', mimeType: 'application/pdf' }],
      modelUsed: MODEL,
      createdAt: seeded.createdAt,
      updatedAt: seeded.updatedAt,
    });
    expect(evaluationRepository.findById).toHaveBeenCalledWith(seeded._id.toString());
  });

  test('getEvaluation: an evaluation without result fields maps its optional fields away', async () => {
    const seeded = await seedEvaluation({
      risk: { pros: [], cons: [] },
      modelUsed: undefined,
    });

    const response = await post(app, '/getEvaluation', { id: seeded._id.toString() });

    expect(response.status).toBe(200);
    expect(response.body.modelUsed).toBeUndefined();
    expect(response.body.risk).toEqual({ pros: [], cons: [] });
  });

  test('getEvaluation: an unknown id maps to 404 NOT_FOUND', async () => {
    const response = await post(app, '/getEvaluation', { id: UNKNOWN_ID });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: 'NOT_FOUND', message: `Evaluation ${UNKNOWN_ID} not found` },
    });
  });

  test('getEvaluation: an invalid payload never reaches the repository', async () => {
    const response = await post(app, '/getEvaluation', {});

    expect(response.status).not.toBe(200);
    expect(evaluationRepository.findById).toHaveBeenCalledTimes(0);
  });

  test('getEvaluations: returns every evaluation matching the filter', async () => {
    const first = await seedEvaluation({ parentId: 'pool-1', risk: { score: 10, pros: [], cons: [] } });
    const second = await seedEvaluation({ parentId: 'pool-1', risk: { score: 20, pros: [], cons: [] } });
    const third = await seedEvaluation({ parentId: 'pool-2', risk: { score: 90, pros: [], cons: [] } });

    const response = await post(app, '/getEvaluations', { filter: { parentId: 'pool-1' } });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
    expect(response.body.map((evaluation: any) => evaluation.id)).toEqual([
      first._id.toString(),
      second._id.toString(),
    ]);
    expect(response.body.map((evaluation: any) => evaluation.id)).not.toContain(third._id.toString());
    expect(evaluationRepository.findAll).toHaveBeenCalledWith({ parentId: 'pool-1' }, undefined, undefined, undefined);
  });

  test('getEvaluations: sort and pagination are forwarded to the repository', async () => {
    await seedEvaluation({ parentId: 'pool-1', risk: { score: 10, pros: [], cons: [] } });
    const second = await seedEvaluation({ parentId: 'pool-1', risk: { score: 20, pros: [], cons: [] } });
    const third = await seedEvaluation({ parentId: 'pool-1', risk: { score: 30, pros: [], cons: [] } });

    const response = await post(app, '/getEvaluations', {
      filter: { parentId: 'pool-1' },
      sort: { createdAt: 'desc' },
      limit: 2,
      offset: 1,
    });

    expect(response.status).toBe(200);
    expect(response.body.map((evaluation: any) => evaluation.id)).toEqual([
      second._id.toString(),
      third._id.toString(),
    ]);
    expect(evaluationRepository.findAll).toHaveBeenCalledWith({ parentId: 'pool-1' }, { createdAt: 'desc' }, 2, 1);
  });

  test('getEvaluations: every filter key is forwarded verbatim', async () => {
    await seedEvaluation({ entityType: 'pool', parentId: 'pool-1', grandParentId: 'business-1' });
    await seedEvaluation({ entityType: 'business', parentId: 'business-1', grandParentId: 'business-1' });

    const response = await post(app, '/getEvaluations', { filter: { entityType: 'business', parentId: 'business-1' } });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].entityType).toBe('business');
    expect(evaluationRepository.findAll).toHaveBeenCalledWith(
      { entityType: 'business', parentId: 'business-1' },
      undefined,
      undefined,
      undefined,
    );
  });

  test('getEvaluations: returns an empty array when nothing matches', async () => {
    await seedEvaluation();

    const response = await post(app, '/getEvaluations', { filter: { parentId: 'nobody' } });

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  test('getEvaluations: a missing filter never reaches the repository', async () => {
    const response = await post(app, '/getEvaluations', {});

    expect(response.status).not.toBe(200);
    expect(evaluationRepository.findAll).toHaveBeenCalledTimes(0);
  });

  test('evaluate: answers with the evaluation id and leaves a pending job', async () => {
    const response = await post(app, '/evaluate', {
      entityType: 'pool',
      entityId: 'pool-1',
      ownerId: 'owner-1',
      ownerType: 'business',
    });

    expect(response.status).toBe(200);

    const job = [...evaluationJobRepository.store.values()][0];

    expect(response.body).toEqual({ evaluationId: String(job.evaluationId) });
    expect(job).toMatchObject({ status: 'pending', entityId: 'pool-1', attempts: 0 });
  });

  test('evaluate: rejects the request when the cooldown is active', async () => {
    await evaluationRepository.create({
      entityType: 'pool',
      parentId: 'pool-1',
      grandParentId: 'business-1',
      ownerId: 'owner-1',
      ownerType: 'business',
      summary: 'previous',
      risk: { score: 10, pros: [], cons: [] },
    });

    const appWithCooldown = buildApp(evaluationRepository, evaluationJobRepository, 86_400);

    const response = await post(appWithCooldown, '/evaluate', {
      entityType: 'pool',
      entityId: 'pool-1',
      ownerId: 'owner-1',
      ownerType: 'business',
    });

    expect(response.status).toBe(429);
    expect(response.body).toMatchObject({ error: { code: 'EVALUATION_COOLDOWN' } });
  });
});
