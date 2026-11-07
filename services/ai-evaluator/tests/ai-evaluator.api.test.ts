/**
 * Component tests for the ai-evaluator HTTP layer.
 *
 * The whole Elysia app is assembled in-process: real controllers and the real
 * services, with the repositories replaced by in-memory fakes and every injected
 * client replaced by a fake as well. Requests go through app.handle() — no port
 * is bound, nothing is queried over the network.
 * Run with `bun test` from services/ai-evaluator.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { Elysia } from 'elysia';
import mongoose from 'mongoose';
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
import { createFakeEdenClients, edenOk } from './fakes/eden.clients.fake';
import { createFakeOpenRouterClient } from './fakes/openrouter.client.fake';
import { createFakeRabbitMQClient } from './fakes/rabbitmq.client.fake';

const MODEL = 'test/model';

/** Well-formed (hex, 24 chars) but absent id: the repository casts ids before querying. */
const UNKNOWN_ID = '64b7f8f0f1f2f3f4f5f6f7a8';

function buildApp(cooldownSeconds = 0) {
  (mongoose.connection as unknown as { transaction: unknown }).transaction = async <T>(
    fn: () => Promise<T>,
  ): Promise<T> => fn();

  const evaluationRepository = createFakeEvaluationRepository();
  const outboxRepository = {
    create: mock(async (doc: Record<string, unknown>) => ({ _id: 'outbox-1', ...doc })),
    releaseSending: mock(async (_exchange: string) => undefined),
    claimNext: mock(async (_exchange: string) => null),
    markSent: mock(async (_id: unknown) => undefined),
    markAttemptFailed: mock(async (_id: unknown) => null),
  };

  const repositoriesPlugin = new Elysia({ name: 'Repositories' })
    .decorate('evaluationRepository', evaluationRepository)
    .decorate('outboxPublisherMessageRepository', outboxRepository);

  const eden = createFakeEdenClients();
  eden.rwaClient.getPool.post.mockImplementation(async () =>
    edenOk({
      id: 'pool-1',
      name: 'Solar Farm',
      description: 'A community solar farm',
      tags: ['energy'],
      entryFeePercent: 1,
      exitFeePercent: 0.5,
      expectedHoldAmount: 1000,
      expectedRwaAmount: 2000,
      rewardPercent: 5,
      businessId: 'business-1',
      poolAddress: '0xpool',
    }),
  );
  const openRouterClient = createFakeOpenRouterClient();
  const jobs = new Map<string, any>();
  const queue = {
    getJob: mock(async (id: string) => jobs.get(id)),
    add: mock(async (_name: string, data: any, options: any) => {
      jobs.set(options.jobId, { id: options.jobId, data });
      return jobs.get(options.jobId);
    }),
  };
  const bullMqClient = { getQueue: mock((_type: string) => queue), jobs };

  const clientsPlugin = new Elysia({ name: 'Clients' })
    .decorate('openRouterClient', openRouterClient)
    .decorate('rwaClient', eden.rwaClient)
    .decorate('documentsClient', eden.documentsClient)
    .decorate('galleryClient', eden.galleryClient)
    .decorate('reactionsClient', eden.reactionsClient)
    .decorate('questionsClient', eden.questionsClient)
    .decorate('portfolioClient', eden.portfolioClient)
    .decorate('jobQueueClient', bullMqClient)
    .decorate('rabbitMQClient', createFakeRabbitMQClient());

  const servicesPlugin = createServicesPlugin(
    repositoriesPlugin as unknown as RepositoriesPlugin,
    clientsPlugin as unknown as ClientsPlugin,
    MODEL,
    20,
    cooldownSeconds,
  );

  const app = new Elysia().onError(ErrorHandlerPlugin).use(createControllersPlugin(servicesPlugin));

  return { app, evaluationRepository, outboxRepository, eden, openRouterClient, bullMqClient };
}

type App = ReturnType<typeof buildApp>['app'];

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

describe('ai-evaluator HTTP layer (component, fake repositories and clients)', () => {
  let ctx: ReturnType<typeof buildApp>;

  beforeEach(() => {
    ctx = buildApp();
  });

  function seedEvaluation(input: Partial<CreateEvaluationInput> = {}) {
    return ctx.evaluationRepository.create({
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

    const response = await post(ctx.app, '/getEvaluation', { id: seeded._id.toString() });

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
  });

  test('getEvaluation: an unknown id maps to 404 NOT_FOUND', async () => {
    const response = await post(ctx.app, '/getEvaluation', { id: UNKNOWN_ID });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: 'NOT_FOUND', message: `Evaluation ${UNKNOWN_ID} not found` },
    });
  });

  test('getEvaluation: an invalid payload never reaches the repository', async () => {
    const response = await post(ctx.app, '/getEvaluation', {});

    expect(response.status).not.toBe(200);
    expect(ctx.evaluationRepository.findById).toHaveBeenCalledTimes(0);
  });

  test('getEvaluations: returns every evaluation matching the filter', async () => {
    const first = await seedEvaluation({ parentId: 'pool-1' });
    const second = await seedEvaluation({ parentId: 'pool-1' });
    const third = await seedEvaluation({ parentId: 'pool-2' });

    const response = await post(ctx.app, '/getEvaluations', { filter: { parentId: 'pool-1' } });

    expect(response.status).toBe(200);
    expect(response.body.map((evaluation: any) => evaluation.id)).toEqual([
      first._id.toString(),
      second._id.toString(),
    ]);
    expect(response.body.map((evaluation: any) => evaluation.id)).not.toContain(third._id.toString());
  });

  test('jobEvaluation: queues the task and returns its id', async () => {
    const response = await post(ctx.app, '/jobEvaluation', { entityType: 'pool', entityId: 'pool-1' });

    expect(response.status).toBe(200);
    expect(response.body.evaluationId).toMatch(/^[a-f0-9]{24}$/);
    expect(ctx.bullMqClient.getQueue).toHaveBeenCalledWith('evaluation');
    expect(ctx.bullMqClient.jobs.get('evaluation-pool-pool-1').data).toMatchObject({
      index: 0,
      state: { entityType: 'pool', entityId: 'pool-1', evaluationId: response.body.evaluationId },
    });
  });

  test('jobEvaluation: rejects the request when the cooldown is active', async () => {
    const withCooldown = buildApp(86_400);
    await withCooldown.evaluationRepository.create({
      entityType: 'pool',
      parentId: 'pool-1',
      grandParentId: 'business-1',
      ownerId: 'owner-1',
      ownerType: 'business',
      summary: 'previous',
      risk: { score: 10, pros: [], cons: [] },
    });

    const response = await post(withCooldown.app, '/jobEvaluation', { entityType: 'pool', entityId: 'pool-1' });

    expect(response.status).toBe(429);
    expect(response.body).toMatchObject({ error: { code: 'EVALUATION_COOLDOWN' } });
  });

  test('jobEvaluation: rejects the request when the task is already queued', async () => {
    ctx.bullMqClient.jobs.set('evaluation-pool-pool-1', { id: 'evaluation-pool-pool-1' });

    const response = await post(ctx.app, '/jobEvaluation', { entityType: 'pool', entityId: 'pool-1' });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: { code: 'JOB_IN_PROGRESS' } });
  });
});
