/**
 * Isolated resolver tests for the gateway reactions module.
 *
 * Resolvers are plain functions invoked directly with a fake GraphQL context:
 * eden clients and inner services are in-memory fakes from tests/fakes/*.
 * No network, no database, no broker, no ports.
 */
import { describe, expect, test } from 'bun:test';
import { AppError } from '@shared/errors/app-errors';
import type { GraphQLContext } from '../../src/graphql/context/types';
import { createFakeContext, fakeUser } from '../fakes/context.fake';
import { edenError, edenOk } from '../fakes/clients.fake';
import { getEntityReactions } from '../../src/graphql/modules/reactions/resolvers/queries/getEntityReactions';
import { getReactions } from '../../src/graphql/modules/reactions/resolvers/queries/getReactions';
import { setReaction } from '../../src/graphql/modules/reactions/resolvers/mutations/setReaction';
import { resetReaction } from '../../src/graphql/modules/reactions/resolvers/mutations/resetReaction';

const REACTION = {
  id: 'reaction-1',
  parentId: 'parent-1',
  parentType: 'post',
  userId: 'user-1',
  reaction: 'like',
  createdAt: 1000,
  updatedAt: 2000,
};

const ENTITY_REACTIONS = { reactions: { like: 2, love: 1 }, userReactions: ['like'] };

const SET_REACTION_INPUT = { parentId: 'parent-1', parentType: 'post', reaction: 'like' };

describe('gateway reactions resolvers (unit, fake clients/services)', () => {
  // Query.getEntityReactions -------------------------------------------------
  test('getEntityReactions: forwards the entity and the caller id, and returns the data as-is', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.reactionsClient.getEntityReactions.post.mockImplementation(async () => edenOk(ENTITY_REACTIONS));

    const result = await getEntityReactions(
      null as never,
      { parentId: 'parent-1', parentType: 'post' } as never,
      fake as unknown as GraphQLContext,
    );

    expect(fake.clients.reactionsClient.getEntityReactions.post).toHaveBeenCalledWith({
      parentId: 'parent-1',
      parentType: 'post',
      userId: 'user-1',
    });
    expect(result).toEqual(ENTITY_REACTIONS);
  });

  test('getEntityReactions: is public and sends userId undefined for an anonymous caller', async () => {
    const fake = createFakeContext();
    fake.clients.reactionsClient.getEntityReactions.post.mockImplementation(async () =>
      edenOk({ reactions: {}, userReactions: [] }),
    );

    const result = await getEntityReactions(
      null as never,
      { parentId: 'parent-1', parentType: 'post' } as never,
      fake as unknown as GraphQLContext,
    );

    const [payload] = fake.clients.reactionsClient.getEntityReactions.post.mock.calls[0] as [Record<string, unknown>];
    expect(Object.keys(payload).sort()).toEqual(['parentId', 'parentType', 'userId']);
    expect(payload.userId).toBeUndefined();
    expect(result).toEqual({ reactions: {}, userReactions: [] });
  });

  test('getEntityReactions: maps an upstream error to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext();
    fake.clients.reactionsClient.getEntityReactions.post.mockImplementation(async () =>
      edenError(500, 'INTERNAL_ERROR', 'boom'),
    );

    await expect(
      getEntityReactions(
        null as never,
        { parentId: 'parent-1', parentType: 'post' } as never,
        fake as unknown as GraphQLContext,
      ),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
  });

  // Query.getReactions -------------------------------------------------------
  test('getReactions: forwards filter, sort and pagination and returns the rows as-is', async () => {
    const fake = createFakeContext();
    fake.clients.reactionsClient.getReactions.post.mockImplementation(async () => edenOk([REACTION]));

    const input = { filter: { parentId: 'parent-1' }, sort: { createdAt: -1 }, limit: 20, offset: 40 };
    const result = await getReactions(null as never, { input } as never, fake as unknown as GraphQLContext);

    expect(fake.clients.reactionsClient.getReactions.post).toHaveBeenCalledWith({
      filter: { parentId: 'parent-1' },
      sort: { createdAt: -1 },
      limit: 20,
      offset: 40,
    });
    expect(result).toEqual([REACTION]);
  });

  test('getReactions: forwards undefined sort/limit/offset unchanged (no empty-object fallback)', async () => {
    // Unlike getBlogs/getFaqTopics, this resolver forwards the raw optional
    // fields instead of defaulting filter/sort to {} — kept faithful here.
    const fake = createFakeContext();
    fake.clients.reactionsClient.getReactions.post.mockImplementation(async () => edenOk([]));

    const input = { filter: { userId: 'user-1' } };
    const result = await getReactions(null as never, { input } as never, fake as unknown as GraphQLContext);

    const [payload] = fake.clients.reactionsClient.getReactions.post.mock.calls[0] as [Record<string, unknown>];
    expect(payload).toEqual({
      filter: { userId: 'user-1' },
      sort: undefined,
      limit: undefined,
      offset: undefined,
    });
    expect(Object.keys(payload).sort()).toEqual(['filter', 'limit', 'offset', 'sort']);
    expect(result).toEqual([]);
  });

  test('getReactions: maps an upstream error to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext();
    fake.clients.reactionsClient.getReactions.post.mockImplementation(async () =>
      edenError(500, 'INTERNAL_ERROR', 'boom'),
    );

    await expect(
      getReactions(null as never, { input: { filter: {} } } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
  });

  // Mutation.setReaction -----------------------------------------------------
  test('setReaction: rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
    const fake = createFakeContext();

    await expect(
      setReaction(null as never, { input: SET_REACTION_INPUT } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

    expect(fake.clients.reactionsClient.setReaction.post).toHaveBeenCalledTimes(0);
  });

  test('setReaction: forwards the input with the caller id and returns the reaction', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.reactionsClient.setReaction.post.mockImplementation(async () => edenOk(REACTION));

    const result = await setReaction(
      null as never,
      { input: SET_REACTION_INPUT } as never,
      fake as unknown as GraphQLContext,
    );

    expect(fake.clients.reactionsClient.setReaction.post).toHaveBeenCalledWith({
      parentId: 'parent-1',
      parentType: 'post',
      userId: 'user-1',
      reaction: 'like',
    });
    expect(result).toEqual(REACTION);
  });

  test('setReaction: maps an upstream error to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.reactionsClient.setReaction.post.mockImplementation(async () =>
      edenError(500, 'INTERNAL_ERROR', 'boom'),
    );

    await expect(
      setReaction(null as never, { input: SET_REACTION_INPUT } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
  });

  // Mutation.resetReaction ---------------------------------------------------
  test('resetReaction: rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
    const fake = createFakeContext();

    await expect(
      resetReaction(null as never, { input: SET_REACTION_INPUT } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

    expect(fake.clients.reactionsClient.resetReaction.post).toHaveBeenCalledTimes(0);
  });

  test('resetReaction: forwards the input with the caller id and returns the data as-is', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.reactionsClient.resetReaction.post.mockImplementation(async () => edenOk(REACTION));

    const result = await resetReaction(
      null as never,
      { input: SET_REACTION_INPUT } as never,
      fake as unknown as GraphQLContext,
    );

    expect(fake.clients.reactionsClient.resetReaction.post).toHaveBeenCalledWith({
      parentId: 'parent-1',
      parentType: 'post',
      userId: 'user-1',
      reaction: 'like',
    });
    expect(result).toEqual(REACTION);
  });

  test('resetReaction: maps an upstream error to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.reactionsClient.resetReaction.post.mockImplementation(async () =>
      edenError(500, 'INTERNAL_ERROR', 'boom'),
    );

    await expect(
      resetReaction(null as never, { input: SET_REACTION_INPUT } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
  });
});
