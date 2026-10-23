/**
 * Isolated resolver tests for the gateway FAQ module.
 *
 * Resolvers are plain functions invoked directly with a fake GraphQL context:
 * eden clients and inner services are in-memory fakes from tests/fakes/*.
 * No network, no database, no broker, no ports.
 */
import { describe, expect, test } from 'bun:test';
import type { GraphQLResolveInfo } from 'graphql';
import { AppError } from '@shared/errors/app-errors';
import type { GraphQLContext } from '../../src/graphql/context/types';
import { createFakeContext, fakeUser } from '../fakes/context.fake';
import { edenError, edenOk } from '../fakes/clients.fake';
import { getFaqTopic } from '../../src/graphql/modules/faq/resolvers/queries/getFaqTopic';
import { getFaqTopics } from '../../src/graphql/modules/faq/resolvers/queries/getFaqTopics';
import { getFaqAnswer } from '../../src/graphql/modules/faq/resolvers/queries/getFaqAnswer';
import { getFaqAnswers } from '../../src/graphql/modules/faq/resolvers/queries/getFaqAnswers';
import { createFaqTopic } from '../../src/graphql/modules/faq/resolvers/mutations/createFaqTopic';
import { updateFaqTopic } from '../../src/graphql/modules/faq/resolvers/mutations/updateFaqTopic';
import { deleteFaqTopic } from '../../src/graphql/modules/faq/resolvers/mutations/deleteFaqTopic';
import { createFaqAnswer } from '../../src/graphql/modules/faq/resolvers/mutations/createFaqAnswer';
import { updateFaqAnswer } from '../../src/graphql/modules/faq/resolvers/mutations/updateFaqAnswer';
import { deleteFaqAnswer } from '../../src/graphql/modules/faq/resolvers/mutations/deleteFaqAnswer';

const INFO = {} as GraphQLResolveInfo;
const TOPIC = {
  id: 'topic-1',
  name: 'Getting started',
  ownerId: 'owner-1',
  ownerType: 'business',
  creator: 'user-1',
  parentId: 'parent-1',
  grandParentId: 'grand-1',
  createdAt: 1000,
  updatedAt: 2000,
};

/** Upstream rows carry storage-only fields that the gateway must not leak. */
const UPSTREAM_TOPIC = { ...TOPIC, _id: 'mongo-topic-1' };
const UPSTREAM_TOPIC_2 = { ...TOPIC, id: 'topic-2', name: 'Limits', _id: 'mongo-topic-2' };

const ANSWER = {
  id: 'answer-1',
  topicId: 'topic-1',
  question: 'What is HOLD?',
  answer: 'The platform token.',
  order: 3,
  ownerId: 'owner-1',
  ownerType: 'business',
  creator: 'user-1',
  parentId: 'parent-1',
  grandParentId: 'grand-1',
  createdAt: 1000,
  updatedAt: 2000,
};

const UPSTREAM_ANSWER = { ...ANSWER, _id: 'mongo-answer-1' };

const PARENT_INFO = { grandParentId: 'grand-1', ownerId: 'owner-1', ownerType: 'business' };

const CREATE_TOPIC_INPUT = { name: 'Getting started', parentId: 'parent-1', type: 'business' };
const CREATE_ANSWER_INPUT = {
  topicId: 'topic-1',
  question: 'What is HOLD?',
  answer: 'The platform token.',
  order: 3,
};

describe('gateway FAQ resolvers (unit, fake clients/services)', () => {
  // Query.getFaqTopic -------------------------------------------------------
  test('getFaqTopic: forwards the id and maps the topic fields', async () => {
    const fake = createFakeContext();
    fake.clients.faqClient.getTopic.post.mockImplementation(async () => edenOk(UPSTREAM_TOPIC));

    const result = await getFaqTopic!(null as never, { id: 'topic-1' } as never, fake as unknown as GraphQLContext, INFO);

    expect(fake.clients.faqClient.getTopic.post).toHaveBeenCalledWith({ id: 'topic-1' });
    expect(result).toEqual(TOPIC); // storage-only fields such as `_id` are dropped
  });

  test('getFaqTopic: maps an upstream error to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext();
    fake.clients.faqClient.getTopic.post.mockImplementation(async () => edenError(404, 'NOT_FOUND', 'no topic'));

    await expect(
      getFaqTopic!(null as never, { id: 'missing' } as never, fake as unknown as GraphQLContext, INFO),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
  });

  // Query.getFaqTopics ------------------------------------------------------
  test('getFaqTopics: forwards filter, sort and pagination and maps every topic', async () => {
    const fake = createFakeContext();
    fake.clients.faqClient.getTopics.post.mockImplementation(async () => edenOk([UPSTREAM_TOPIC, UPSTREAM_TOPIC_2]));

    const input = { filter: { ownerId: 'owner-1' }, sort: { name: 1 }, limit: 10, offset: 5 };
    const result = await getFaqTopics!(null as never, { input } as never, fake as unknown as GraphQLContext, INFO);

    expect(fake.clients.faqClient.getTopics.post).toHaveBeenCalledWith({
      filter: { ownerId: 'owner-1' },
      sort: { name: 1 },
      limit: 10,
      offset: 5,
    });
    expect(result).toEqual([TOPIC, { ...TOPIC, id: 'topic-2', name: 'Limits' }]);
  });

  test('getFaqTopics: defaults filter and sort to empty objects when input is omitted', async () => {
    const fake = createFakeContext();
    fake.clients.faqClient.getTopics.post.mockImplementation(async () => edenOk([]));

    const result = await getFaqTopics!(null as never, {} as never, fake as unknown as GraphQLContext, INFO);

    expect(fake.clients.faqClient.getTopics.post).toHaveBeenCalledWith({
      filter: {},
      sort: {},
      limit: undefined,
      offset: undefined,
    });
    expect(result).toEqual([]);
  });

  test('getFaqTopics: maps an upstream error to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext();
    fake.clients.faqClient.getTopics.post.mockImplementation(async () => edenError(500, 'INTERNAL_ERROR', 'boom'));

    await expect(
      getFaqTopics!(null as never, { input: {} } as never, fake as unknown as GraphQLContext, INFO),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
  });

  // Query.getFaqAnswer ------------------------------------------------------
  test('getFaqAnswer: forwards the id and maps the answer fields', async () => {
    const fake = createFakeContext();
    fake.clients.faqClient.getAnswer.post.mockImplementation(async () => edenOk(UPSTREAM_ANSWER));

    const result = await getFaqAnswer!(null as never, { id: 'answer-1' } as never, fake as unknown as GraphQLContext, INFO);

    expect(fake.clients.faqClient.getAnswer.post).toHaveBeenCalledWith({ id: 'answer-1' });
    expect(result).toEqual(ANSWER);
  });

  test('getFaqAnswer: maps an upstream error to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext();
    fake.clients.faqClient.getAnswer.post.mockImplementation(async () => edenError(404, 'NOT_FOUND', 'no answer'));

    await expect(
      getFaqAnswer!(null as never, { id: 'missing' } as never, fake as unknown as GraphQLContext, INFO),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
  });

  // Query.getFaqAnswers -----------------------------------------------------
  test('getFaqAnswers: forwards filter, sort and pagination and maps every answer', async () => {
    const fake = createFakeContext();
    fake.clients.faqClient.getAnswers.post.mockImplementation(async () => edenOk([UPSTREAM_ANSWER]));

    const input = { filter: { topicId: 'topic-1' }, sort: { order: 1 }, limit: 20, offset: 40 };
    const result = await getFaqAnswers!(null as never, { input } as never, fake as unknown as GraphQLContext, INFO);

    expect(fake.clients.faqClient.getAnswers.post).toHaveBeenCalledWith({
      filter: { topicId: 'topic-1' },
      sort: { order: 1 },
      limit: 20,
      offset: 40,
    });
    expect(result).toEqual([ANSWER]);
  });

  test('getFaqAnswers: defaults filter and sort to empty objects when input is omitted', async () => {
    const fake = createFakeContext();
    fake.clients.faqClient.getAnswers.post.mockImplementation(async () => edenOk([]));

    const result = await getFaqAnswers!(null as never, {} as never, fake as unknown as GraphQLContext, INFO);

    expect(fake.clients.faqClient.getAnswers.post).toHaveBeenCalledWith({
      filter: {},
      sort: {},
      limit: undefined,
      offset: undefined,
    });
    expect(result).toEqual([]);
  });

  test('getFaqAnswers: maps an upstream error to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext();
    fake.clients.faqClient.getAnswers.post.mockImplementation(async () => edenError(500, 'INTERNAL_ERROR', 'boom'));

    await expect(
      getFaqAnswers!(null as never, { input: {} } as never, fake as unknown as GraphQLContext, INFO),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
  });

  // Mutation.createFaqTopic -------------------------------------------------
  test('createFaqTopic: rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
    const fake = createFakeContext();

    await expect(
      createFaqTopic!(null as never, { input: CREATE_TOPIC_INPUT } as never, fake as unknown as GraphQLContext, INFO),
    ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

    expect(fake.services.parent.getParentInfo).toHaveBeenCalledTimes(0);
    expect(fake.services.ownership.checkOwnership).toHaveBeenCalledTimes(0);
    expect(fake.clients.faqClient.createTopic.post).toHaveBeenCalledTimes(0);
  });

  test('createFaqTopic: resolves the owner via parent info, checks ownership and forwards the payload', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.services.parent.getParentInfo.mockImplementation(async () => PARENT_INFO);
    fake.clients.faqClient.createTopic.post.mockImplementation(async () => edenOk(UPSTREAM_TOPIC));

    const result = await createFaqTopic!(
      null as never,
      { input: CREATE_TOPIC_INPUT } as never,
      fake as unknown as GraphQLContext,
    INFO);

    expect(fake.services.parent.getParentInfo).toHaveBeenCalledWith('business', 'parent-1', 'user-1');
    expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
      userId: 'user-1',
      ownerId: 'owner-1',
      ownerType: 'business',
      permission: 'content',
    });
    expect(fake.clients.faqClient.createTopic.post).toHaveBeenCalledWith({
      name: 'Getting started',
      ownerId: 'owner-1',
      ownerType: 'business',
      creator: 'user-1',
      parentId: 'parent-1',
      grandParentId: 'grand-1',
    });
    expect(result).toEqual(TOPIC);
  });

  test('createFaqTopic: propagates a 403 from the ownership check and never calls the client', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.services.parent.getParentInfo.mockImplementation(async () => PARENT_INFO);
    fake.services.ownership.checkOwnership.mockImplementation(async () => {
      throw new AppError({ message: 'User does not have permission', statusCode: 403, code: 'FORBIDDEN' });
    });

    await expect(
      createFaqTopic!(null as never, { input: CREATE_TOPIC_INPUT } as never, fake as unknown as GraphQLContext, INFO),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

    expect(fake.clients.faqClient.createTopic.post).toHaveBeenCalledTimes(0);
  });

  test('createFaqTopic: maps an upstream error to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.services.parent.getParentInfo.mockImplementation(async () => PARENT_INFO);
    fake.clients.faqClient.createTopic.post.mockImplementation(async () => edenError(500, 'INTERNAL_ERROR', 'boom'));

    await expect(
      createFaqTopic!(null as never, { input: CREATE_TOPIC_INPUT } as never, fake as unknown as GraphQLContext, INFO),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
  });

  // Mutation.updateFaqTopic -------------------------------------------------
  test('updateFaqTopic: rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
    const fake = createFakeContext();

    await expect(
      updateFaqTopic!(
        null as never,
        { input: { id: 'topic-1', updateData: { name: 'Renamed' } } } as never,
        fake as unknown as GraphQLContext,
      INFO),
    ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

    expect(fake.clients.faqClient.getTopic.post).toHaveBeenCalledTimes(0);
    expect(fake.clients.faqClient.updateTopic.post).toHaveBeenCalledTimes(0);
  });

  test('updateFaqTopic: loads the topic, checks ownership and forwards the update', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.faqClient.getTopic.post.mockImplementation(async () => edenOk(UPSTREAM_TOPIC));
    fake.clients.faqClient.updateTopic.post.mockImplementation(async () =>
      edenOk({ ...UPSTREAM_TOPIC, name: 'Renamed' }),
    );

    const input = { id: 'topic-1', updateData: { name: 'Renamed' } };
    const result = await updateFaqTopic!(null as never, { input } as never, fake as unknown as GraphQLContext, INFO);

    expect(fake.clients.faqClient.getTopic.post).toHaveBeenCalledWith({ id: 'topic-1' });
    expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
      userId: 'user-1',
      ownerId: 'owner-1',
      ownerType: 'business',
      permission: 'content',
    });
    expect(fake.clients.faqClient.updateTopic.post).toHaveBeenCalledWith({
      id: 'topic-1',
      updateData: { name: 'Renamed' },
    });
    expect(result).toEqual({ ...TOPIC, name: 'Renamed' });
  });

  test('updateFaqTopic: maps a failed topic lookup to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.faqClient.getTopic.post.mockImplementation(async () => edenError(404, 'NOT_FOUND', 'no topic'));

    await expect(
      updateFaqTopic!(
        null as never,
        { input: { id: 'missing', updateData: { name: 'Renamed' } } } as never,
        fake as unknown as GraphQLContext,
      INFO),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });

    expect(fake.services.ownership.checkOwnership).toHaveBeenCalledTimes(0);
    expect(fake.clients.faqClient.updateTopic.post).toHaveBeenCalledTimes(0);
  });

  test('updateFaqTopic: propagates a 403 from the ownership check and never updates', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.faqClient.getTopic.post.mockImplementation(async () => edenOk(UPSTREAM_TOPIC));
    fake.services.ownership.checkOwnership.mockImplementation(async () => {
      throw new AppError({ message: 'User does not have permission', statusCode: 403, code: 'FORBIDDEN' });
    });

    await expect(
      updateFaqTopic!(
        null as never,
        { input: { id: 'topic-1', updateData: { name: 'Renamed' } } } as never,
        fake as unknown as GraphQLContext,
      INFO),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

    expect(fake.clients.faqClient.updateTopic.post).toHaveBeenCalledTimes(0);
  });

  test('updateFaqTopic: maps an upstream error to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.faqClient.getTopic.post.mockImplementation(async () => edenOk(UPSTREAM_TOPIC));
    fake.clients.faqClient.updateTopic.post.mockImplementation(async () => edenError(500, 'INTERNAL_ERROR', 'boom'));

    await expect(
      updateFaqTopic!(
        null as never,
        { input: { id: 'topic-1', updateData: { name: 'Renamed' } } } as never,
        fake as unknown as GraphQLContext,
      INFO),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
  });

  // Mutation.deleteFaqTopic -------------------------------------------------
  test('deleteFaqTopic: rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
    const fake = createFakeContext();

    await expect(
      deleteFaqTopic!(null as never, { id: 'topic-1' } as never, fake as unknown as GraphQLContext, INFO),
    ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

    expect(fake.clients.faqClient.deleteTopic.post).toHaveBeenCalledTimes(0);
  });

  test('deleteFaqTopic: loads the topic, checks ownership and returns the deleted id', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.faqClient.getTopic.post.mockImplementation(async () => edenOk(UPSTREAM_TOPIC));
    fake.clients.faqClient.deleteTopic.post.mockImplementation(async () => edenOk({ id: 'topic-1' }));

    const result = await deleteFaqTopic!(null as never, { id: 'topic-1' } as never, fake as unknown as GraphQLContext, INFO);

    expect(fake.clients.faqClient.getTopic.post).toHaveBeenCalledWith({ id: 'topic-1' });
    expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
      userId: 'user-1',
      ownerId: 'owner-1',
      ownerType: 'business',
      permission: 'content',
    });
    expect(fake.clients.faqClient.deleteTopic.post).toHaveBeenCalledWith({ id: 'topic-1' });
    expect(result).toBe('topic-1');
  });

  test('deleteFaqTopic: maps a failed topic lookup to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.faqClient.getTopic.post.mockImplementation(async () => edenError(404, 'NOT_FOUND', 'no topic'));

    await expect(
      deleteFaqTopic!(null as never, { id: 'missing' } as never, fake as unknown as GraphQLContext, INFO),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });

    expect(fake.clients.faqClient.deleteTopic.post).toHaveBeenCalledTimes(0);
  });

  test('deleteFaqTopic: maps an upstream error to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.faqClient.getTopic.post.mockImplementation(async () => edenOk(UPSTREAM_TOPIC));
    fake.clients.faqClient.deleteTopic.post.mockImplementation(async () => edenError(500, 'INTERNAL_ERROR', 'boom'));

    await expect(
      deleteFaqTopic!(null as never, { id: 'topic-1' } as never, fake as unknown as GraphQLContext, INFO),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
  });

  // Mutation.createFaqAnswer ------------------------------------------------
  test('createFaqAnswer: rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
    const fake = createFakeContext();

    await expect(
      createFaqAnswer!(null as never, { input: CREATE_ANSWER_INPUT } as never, fake as unknown as GraphQLContext, INFO),
    ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

    expect(fake.clients.faqClient.getTopic.post).toHaveBeenCalledTimes(0);
    expect(fake.clients.faqClient.createAnswer.post).toHaveBeenCalledTimes(0);
  });

  test('createFaqAnswer: loads the topic, checks ownership and forwards the answer payload', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.faqClient.getTopic.post.mockImplementation(async () => edenOk(UPSTREAM_TOPIC));
    fake.clients.faqClient.createAnswer.post.mockImplementation(async () => edenOk(UPSTREAM_ANSWER));

    const result = await createFaqAnswer!(
      null as never,
      { input: CREATE_ANSWER_INPUT } as never,
      fake as unknown as GraphQLContext,
    INFO);

    expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
      userId: 'user-1',
      ownerId: 'owner-1',
      ownerType: 'business',
      permission: 'content',
    });
    expect(fake.clients.faqClient.createAnswer.post).toHaveBeenCalledWith({
      topicId: 'topic-1',
      question: 'What is HOLD?',
      answer: 'The platform token.',
      order: 3,
      ownerId: 'owner-1',
      ownerType: 'business',
      creator: 'user-1',
      parentId: 'parent-1',
      grandParentId: 'grand-1',
    });
    expect(result).toEqual(ANSWER);
  });

  test('createFaqAnswer: defaults a missing order to 0', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.faqClient.getTopic.post.mockImplementation(async () => edenOk(UPSTREAM_TOPIC));
    fake.clients.faqClient.createAnswer.post.mockImplementation(async () => edenOk({ ...UPSTREAM_ANSWER, order: 0 }));

    const input = { topicId: 'topic-1', question: 'What is HOLD?', answer: 'The platform token.' };
    const result = await createFaqAnswer!(null as never, { input } as never, fake as unknown as GraphQLContext, INFO);

    expect(fake.clients.faqClient.createAnswer.post).toHaveBeenCalledWith({
      topicId: 'topic-1',
      question: 'What is HOLD?',
      answer: 'The platform token.',
      order: 0,
      ownerId: 'owner-1',
      ownerType: 'business',
      creator: 'user-1',
      parentId: 'parent-1',
      grandParentId: 'grand-1',
    });
    expect(result.order).toBe(0);
  });

  test('createFaqAnswer: maps a failed topic lookup to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.faqClient.getTopic.post.mockImplementation(async () => edenError(404, 'NOT_FOUND', 'no topic'));

    await expect(
      createFaqAnswer!(null as never, { input: CREATE_ANSWER_INPUT } as never, fake as unknown as GraphQLContext, INFO),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });

    expect(fake.clients.faqClient.createAnswer.post).toHaveBeenCalledTimes(0);
  });

  test('createFaqAnswer: propagates a 403 from the ownership check and never creates', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.faqClient.getTopic.post.mockImplementation(async () => edenOk(UPSTREAM_TOPIC));
    fake.services.ownership.checkOwnership.mockImplementation(async () => {
      throw new AppError({ message: 'User does not have permission', statusCode: 403, code: 'FORBIDDEN' });
    });

    await expect(
      createFaqAnswer!(null as never, { input: CREATE_ANSWER_INPUT } as never, fake as unknown as GraphQLContext, INFO),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

    expect(fake.clients.faqClient.createAnswer.post).toHaveBeenCalledTimes(0);
  });

  test('createFaqAnswer: maps an upstream error to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.faqClient.getTopic.post.mockImplementation(async () => edenOk(UPSTREAM_TOPIC));
    fake.clients.faqClient.createAnswer.post.mockImplementation(async () => edenError(500, 'INTERNAL_ERROR', 'boom'));

    await expect(
      createFaqAnswer!(null as never, { input: CREATE_ANSWER_INPUT } as never, fake as unknown as GraphQLContext, INFO),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
  });

  // Mutation.updateFaqAnswer ------------------------------------------------
  test('updateFaqAnswer: rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
    const fake = createFakeContext();

    await expect(
      updateFaqAnswer!(
        null as never,
        { input: { id: 'answer-1', updateData: { answer: 'Updated' } } } as never,
        fake as unknown as GraphQLContext,
      INFO),
    ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

    expect(fake.clients.faqClient.getAnswer.post).toHaveBeenCalledTimes(0);
    expect(fake.clients.faqClient.updateAnswer.post).toHaveBeenCalledTimes(0);
  });

  test('updateFaqAnswer: loads the answer, checks ownership and forwards the update', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.faqClient.getAnswer.post.mockImplementation(async () => edenOk(UPSTREAM_ANSWER));
    fake.clients.faqClient.updateAnswer.post.mockImplementation(async () =>
      edenOk({ ...UPSTREAM_ANSWER, answer: 'Updated' }),
    );

    const input = { id: 'answer-1', updateData: { answer: 'Updated' } };
    const result = await updateFaqAnswer!(null as never, { input } as never, fake as unknown as GraphQLContext, INFO);

    expect(fake.clients.faqClient.getAnswer.post).toHaveBeenCalledWith({ id: 'answer-1' });
    expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
      userId: 'user-1',
      ownerId: 'owner-1',
      ownerType: 'business',
      permission: 'content',
    });
    expect(fake.clients.faqClient.updateAnswer.post).toHaveBeenCalledWith({
      id: 'answer-1',
      updateData: { answer: 'Updated' },
    });
    expect(result).toEqual({ ...ANSWER, answer: 'Updated' });
  });

  test('updateFaqAnswer: maps a failed answer lookup to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.faqClient.getAnswer.post.mockImplementation(async () => edenError(404, 'NOT_FOUND', 'no answer'));

    await expect(
      updateFaqAnswer!(
        null as never,
        { input: { id: 'missing', updateData: { answer: 'Updated' } } } as never,
        fake as unknown as GraphQLContext,
      INFO),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });

    expect(fake.clients.faqClient.updateAnswer.post).toHaveBeenCalledTimes(0);
  });

  test('updateFaqAnswer: propagates a 403 from the ownership check and never updates', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.faqClient.getAnswer.post.mockImplementation(async () => edenOk(UPSTREAM_ANSWER));
    fake.services.ownership.checkOwnership.mockImplementation(async () => {
      throw new AppError({ message: 'User does not have permission', statusCode: 403, code: 'FORBIDDEN' });
    });

    await expect(
      updateFaqAnswer!(
        null as never,
        { input: { id: 'answer-1', updateData: { answer: 'Updated' } } } as never,
        fake as unknown as GraphQLContext,
      INFO),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

    expect(fake.clients.faqClient.updateAnswer.post).toHaveBeenCalledTimes(0);
  });

  test('updateFaqAnswer: maps an upstream error to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.faqClient.getAnswer.post.mockImplementation(async () => edenOk(UPSTREAM_ANSWER));
    fake.clients.faqClient.updateAnswer.post.mockImplementation(async () => edenError(500, 'INTERNAL_ERROR', 'boom'));

    await expect(
      updateFaqAnswer!(
        null as never,
        { input: { id: 'answer-1', updateData: { answer: 'Updated' } } } as never,
        fake as unknown as GraphQLContext,
      INFO),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
  });

  // Mutation.deleteFaqAnswer ------------------------------------------------
  test('deleteFaqAnswer: rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
    const fake = createFakeContext();

    await expect(
      deleteFaqAnswer!(null as never, { id: 'answer-1' } as never, fake as unknown as GraphQLContext, INFO),
    ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

    expect(fake.clients.faqClient.deleteAnswer.post).toHaveBeenCalledTimes(0);
  });

  test('deleteFaqAnswer: loads the answer, checks ownership and returns the deleted id', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.faqClient.getAnswer.post.mockImplementation(async () => edenOk(UPSTREAM_ANSWER));
    fake.clients.faqClient.deleteAnswer.post.mockImplementation(async () => edenOk({ id: 'answer-1' }));

    const result = await deleteFaqAnswer!(null as never, { id: 'answer-1' } as never, fake as unknown as GraphQLContext, INFO);

    expect(fake.clients.faqClient.getAnswer.post).toHaveBeenCalledWith({ id: 'answer-1' });
    expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
      userId: 'user-1',
      ownerId: 'owner-1',
      ownerType: 'business',
      permission: 'content',
    });
    expect(fake.clients.faqClient.deleteAnswer.post).toHaveBeenCalledWith({ id: 'answer-1' });
    expect(result).toBe('answer-1');
  });

  test('deleteFaqAnswer: maps a failed answer lookup to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.faqClient.getAnswer.post.mockImplementation(async () => edenError(404, 'NOT_FOUND', 'no answer'));

    await expect(
      deleteFaqAnswer!(null as never, { id: 'missing' } as never, fake as unknown as GraphQLContext, INFO),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });

    expect(fake.clients.faqClient.deleteAnswer.post).toHaveBeenCalledTimes(0);
  });

  test('deleteFaqAnswer: maps an upstream error to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.faqClient.getAnswer.post.mockImplementation(async () => edenOk(UPSTREAM_ANSWER));
    fake.clients.faqClient.deleteAnswer.post.mockImplementation(async () => edenError(500, 'INTERNAL_ERROR', 'boom'));

    await expect(
      deleteFaqAnswer!(null as never, { id: 'answer-1' } as never, fake as unknown as GraphQLContext, INFO),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
  });
});
