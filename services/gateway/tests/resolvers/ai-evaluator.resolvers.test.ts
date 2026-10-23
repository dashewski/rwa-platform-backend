/**
 * Isolated resolver tests for the ai-evaluator GraphQL module.
 *
 * Resolvers are plain functions called directly with a fake GraphQLContext
 * (tests/fakes/context.fake.ts + clients.fake.ts), so nothing leaves the
 * process: no network, no database, no broker, no ports.
 *
 * Neither resolver in this module reads ctx.user: both destructure it but
 * never check it, so no auth guard exists here. The tests below document that
 * behaviour (kept faithful to src) rather than assuming a 401.
 */
import { describe, expect, test } from 'bun:test';
import type { GraphQLResolveInfo } from 'graphql';
import type { GraphQLContext } from '../../src/graphql/context/types';
import { createFakeContext, fakeUser, type FakeContext } from '../fakes/context.fake';
import { edenError, edenOk } from '../fakes/clients.fake';
import { getEvaluations } from '../../src/graphql/modules/ai-evaluator/resolvers/queries/getEvaluations';
import { getEvaluation } from '../../src/graphql/modules/ai-evaluator/resolvers/queries/getEvaluation';
import type { Evaluation } from '../../src/graphql/generated/types';

const INFO = {} as GraphQLResolveInfo;
const asContext = (fake: FakeContext) => fake as unknown as GraphQLContext;

const EVALUATION: Evaluation = {
  id: 'eval-1',
  entityType: 'business',
  parentId: 'business-1',
  grandParentId: 'company-1',
  ownerId: 'owner-1',
  ownerType: 'business',
  riskScore: 42,
  factors: [{ name: 'team', impact: 'low', detail: 'experienced founders' }],
  evaluatedDocuments: [],
  evaluatedImages: [],
  modelUsed: 'gpt-x',
  createdAt: 1700000000,
  updatedAt: 1700000001,
};

describe('ai-evaluator resolvers (unit, fake clients)', () => {
  describe('getEvaluations', () => {
    test('forwards filter/sort/pagination and returns the evaluations', async () => {
      const fake = createFakeContext({ user: fakeUser });
      const evaluations = [EVALUATION, { ...EVALUATION, id: 'eval-2', riskScore: 10 }];
      fake.clients.aiEvaluatorClient.getEvaluations.post.mockImplementation(async () => edenOk(evaluations));

      const input = {
        filter: { entityType: 'business', ownerId: 'owner-1' },
        sort: { createdAt: 'desc' },
        limit: 10,
        offset: 20,
      };

      const result = await getEvaluations!(null as never, { input } as never, asContext(fake), INFO);

      expect(fake.clients.aiEvaluatorClient.getEvaluations.post).toHaveBeenCalledTimes(1);
      expect(fake.clients.aiEvaluatorClient.getEvaluations.post).toHaveBeenCalledWith({
        filter: { entityType: 'business', ownerId: 'owner-1' },
        sort: { createdAt: 'desc' },
        limit: 10,
        offset: 20,
      });
      expect(result).toEqual(evaluations);
    });

    test('defaults filter to an empty object and leaves sort/pagination undefined when input is omitted', async () => {
      const fake = createFakeContext();
      fake.clients.aiEvaluatorClient.getEvaluations.post.mockImplementation(async () => edenOk([]));

      const result = await getEvaluations!(null as never, {} as never, asContext(fake), INFO);

      expect(fake.clients.aiEvaluatorClient.getEvaluations.post).toHaveBeenCalledWith({
        filter: {},
        sort: undefined,
        limit: undefined,
        offset: undefined,
      });
      expect(result).toEqual([]);
    });

    test('defaults filter to an empty object when only pagination is provided', async () => {
      const fake = createFakeContext();
      fake.clients.aiEvaluatorClient.getEvaluations.post.mockImplementation(async () => edenOk([]));

      await getEvaluations!(null as never, { input: { limit: 5 } } as never, asContext(fake), INFO);

      expect(fake.clients.aiEvaluatorClient.getEvaluations.post).toHaveBeenCalledWith({
        filter: {},
        sort: undefined,
        limit: 5,
        offset: undefined,
      });
    });

    test('is reachable anonymously (the resolver never checks ctx.user)', async () => {
      const fake = createFakeContext();
      fake.clients.aiEvaluatorClient.getEvaluations.post.mockImplementation(async () => edenOk([EVALUATION]));

      const result = await getEvaluations!(null as never, { input: {} } as never, asContext(fake), INFO);

      expect(result).toEqual([EVALUATION]);
    });

    test('maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.aiEvaluatorClient.getEvaluations.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(getEvaluations!(null as never, { input: {} } as never, asContext(fake), INFO)).rejects.toMatchObject({
        statusCode: 502,
        code: 'BAD_GATEWAY',
      });
    });
  });

  describe('getEvaluation', () => {
    test('forwards the id and returns the evaluation', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.aiEvaluatorClient.getEvaluation.post.mockImplementation(async () => edenOk(EVALUATION));

      const result = await getEvaluation!(null as never, { id: 'eval-1' } as never, asContext(fake), INFO);

      expect(fake.clients.aiEvaluatorClient.getEvaluation.post).toHaveBeenCalledWith({ id: 'eval-1' });
      expect(result).toEqual(EVALUATION);
    });

    test('is reachable anonymously (the resolver never checks ctx.user)', async () => {
      const fake = createFakeContext();
      fake.clients.aiEvaluatorClient.getEvaluation.post.mockImplementation(async () => edenOk(EVALUATION));

      const result = await getEvaluation!(null as never, { id: 'eval-1' } as never, asContext(fake), INFO);

      expect(result).toEqual(EVALUATION);
    });

    test('maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.aiEvaluatorClient.getEvaluation.post.mockImplementation(async () =>
        edenError(404, 'NOT_FOUND', 'no evaluation'),
      );

      await expect(getEvaluation!(null as never, { id: 'eval-1' } as never, asContext(fake), INFO)).rejects.toMatchObject({
        statusCode: 502,
        code: 'BAD_GATEWAY',
      });
    });
  });
});
