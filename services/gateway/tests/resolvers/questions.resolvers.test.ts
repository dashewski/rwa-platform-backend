/**
 * Unit tests for the gateway `questions` GraphQL resolvers.
 *
 * Resolvers are plain functions, so every test calls one directly with a fake
 * GraphQL context (createFakeContext): eden clients live under ctx.clients and
 * inner services under ctx.services. Everything is in-memory — no network, no
 * database, no broker, no ports. Run with `bun test` from services/gateway.
 */
import { describe, expect, test } from 'bun:test';
import { AppError } from '@shared/errors/app-errors';
import type { GraphQLContext } from '../../src/graphql/context/types';
import { edenError, edenOk } from '../fakes/clients.fake';
import { createFakeContext, fakeUser } from '../fakes/context.fake';
import { createQuestion } from '../../src/graphql/modules/questions/resolvers/mutations/createQuestion';
import { createQuestionAnswer } from '../../src/graphql/modules/questions/resolvers/mutations/createQuestionAnswer';
import { createTopic } from '../../src/graphql/modules/questions/resolvers/mutations/createTopic';
import { deleteQuestion } from '../../src/graphql/modules/questions/resolvers/mutations/deleteQuestion';
import { deleteTopic } from '../../src/graphql/modules/questions/resolvers/mutations/deleteTopic';
import { toggleQuestionLike } from '../../src/graphql/modules/questions/resolvers/mutations/toggleQuestionLike';
import { updateQuestionAnswer } from '../../src/graphql/modules/questions/resolvers/mutations/updateQuestionAnswer';
import { updateQuestionText } from '../../src/graphql/modules/questions/resolvers/mutations/updateQuestionText';
import { updateTopic } from '../../src/graphql/modules/questions/resolvers/mutations/updateTopic';
import { getQuestion } from '../../src/graphql/modules/questions/resolvers/queries/getQuestion';
import { getQuestions } from '../../src/graphql/modules/questions/resolvers/queries/getQuestions';
import { getTopic } from '../../src/graphql/modules/questions/resolvers/queries/getTopic';
import { getTopics } from '../../src/graphql/modules/questions/resolvers/queries/getTopics';

const TOPIC = {
  id: 'topic-1',
  name: 'Getting started',
  ownerId: 'owner-1',
  ownerType: 'business',
  creator: 'user-1',
  parentId: 'business-1',
  grandParentId: 'business-1',
  createdAt: 1_700_000_000,
  updatedAt: 1_700_000_000,
};

const ANSWER = {
  text: 'The platform token.',
  userId: 'user-1',
  createdAt: 1_700_000_100,
  updatedAt: 1_700_000_100,
};

const QUESTION = {
  id: 'question-1',
  topicId: 'topic-1',
  text: 'What is HOLD?',
  answer: null,
  answered: false,
  likesCount: 0,
  ownerId: 'owner-1',
  ownerType: 'business',
  creator: 'user-1',
  parentId: 'business-1',
  grandParentId: 'business-1',
  createdAt: 1_700_000_000,
  updatedAt: 1_700_000_000,
};

const CREATE_TOPIC_INPUT = { name: 'Getting started', parentId: 'business-1', type: 'business' };
const UPDATE_TOPIC_INPUT = { id: 'topic-1', updateData: { name: 'Renamed topic' } };
const CREATE_QUESTION_INPUT = { topicId: 'topic-1', text: 'What is HOLD?' };
const UPDATE_QUESTION_TEXT_INPUT = { id: 'question-1', updateData: { text: 'What is HOLD exactly?' } };
const CREATE_QUESTION_ANSWER_INPUT = { id: 'question-1', text: 'The platform token.' };
const UPDATE_QUESTION_ANSWER_INPUT = { id: 'question-1', updateData: { text: 'The platform utility token.' } };

describe('questions resolvers (unit, fake context)', () => {
  describe('getTopic', () => {
    test('forwards the id and returns the topic', async () => {
      const fake = createFakeContext();
      fake.clients.questionsClient.getTopic.post.mockImplementation(async () => edenOk(TOPIC));

      const result = await getTopic(null as never, { id: 'topic-1' } as never, fake as unknown as GraphQLContext);

      expect(fake.clients.questionsClient.getTopic.post).toHaveBeenCalledWith({ id: 'topic-1' });
      expect(result).toEqual(TOPIC);
    });

    test('maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext();
      fake.clients.questionsClient.getTopic.post.mockImplementation(async () =>
        edenError(404, 'NOT_FOUND', 'topic not found'),
      );

      await expect(
        getTopic(null as never, { id: 'topic-1' } as never, fake as unknown as GraphQLContext),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to get topic' });
    });
  });

  describe('getTopics', () => {
    test('forwards filter, sort and pagination to the client', async () => {
      const fake = createFakeContext();
      const input = { filter: { ownerId: 'owner-1' }, sort: { createdAt: -1 }, limit: 10, offset: 20 };
      fake.clients.questionsClient.getTopics.post.mockImplementation(async () => edenOk([TOPIC]));

      const result = await getTopics(null as never, { input } as never, fake as unknown as GraphQLContext);

      expect(fake.clients.questionsClient.getTopics.post).toHaveBeenCalledWith({
        filter: input.filter,
        sort: input.sort,
        limit: 10,
        offset: 20,
      });
      expect(result).toEqual([TOPIC]);
    });

    test('defaults filter and sort to empty objects when input is omitted', async () => {
      const fake = createFakeContext();
      fake.clients.questionsClient.getTopics.post.mockImplementation(async () => edenOk([]));

      const result = await getTopics(null as never, {} as never, fake as unknown as GraphQLContext);

      expect(fake.clients.questionsClient.getTopics.post).toHaveBeenCalledWith({
        filter: {},
        sort: {},
        limit: undefined,
        offset: undefined,
      });
      expect(result).toEqual([]);
    });

    test('maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext();
      fake.clients.questionsClient.getTopics.post.mockImplementation(async () => edenError(500));

      await expect(getTopics(null as never, {} as never, fake as unknown as GraphQLContext)).rejects.toMatchObject({
        statusCode: 502,
        code: 'BAD_GATEWAY',
        message: 'Failed to get topics',
      });
    });
  });

  describe('getQuestion', () => {
    test('forwards the id and returns the question', async () => {
      const fake = createFakeContext();
      fake.clients.questionsClient.getQuestion.post.mockImplementation(async () => edenOk(QUESTION));

      const result = await getQuestion(null as never, { id: 'question-1' } as never, fake as unknown as GraphQLContext);

      expect(fake.clients.questionsClient.getQuestion.post).toHaveBeenCalledWith({ id: 'question-1' });
      expect(result).toEqual(QUESTION);
    });

    test('maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext();
      fake.clients.questionsClient.getQuestion.post.mockImplementation(async () =>
        edenError(404, 'NOT_FOUND', 'question not found'),
      );

      await expect(
        getQuestion(null as never, { id: 'question-1' } as never, fake as unknown as GraphQLContext),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to get question' });
    });
  });

  describe('getQuestions', () => {
    test('forwards filter, sort and pagination to the client', async () => {
      const fake = createFakeContext();
      const input = { filter: { topicId: 'topic-1' }, sort: { likesCount: -1 }, limit: 5, offset: 0 };
      fake.clients.questionsClient.getQuestions.post.mockImplementation(async () => edenOk([QUESTION]));

      const result = await getQuestions(null as never, { input } as never, fake as unknown as GraphQLContext);

      expect(fake.clients.questionsClient.getQuestions.post).toHaveBeenCalledWith({
        filter: input.filter,
        sort: input.sort,
        limit: 5,
        offset: 0,
      });
      expect(result).toEqual([QUESTION]);
    });

    test('defaults filter and sort to empty objects when input is omitted', async () => {
      const fake = createFakeContext();
      fake.clients.questionsClient.getQuestions.post.mockImplementation(async () => edenOk([]));

      const result = await getQuestions(null as never, {} as never, fake as unknown as GraphQLContext);

      expect(fake.clients.questionsClient.getQuestions.post).toHaveBeenCalledWith({
        filter: {},
        sort: {},
        limit: undefined,
        offset: undefined,
      });
      expect(result).toEqual([]);
    });

    test('maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext();
      fake.clients.questionsClient.getQuestions.post.mockImplementation(async () => edenError(500));

      await expect(getQuestions(null as never, {} as never, fake as unknown as GraphQLContext)).rejects.toMatchObject({
        statusCode: 502,
        code: 'BAD_GATEWAY',
        message: 'Failed to get questions',
      });
    });
  });

  describe('createTopic', () => {
    test('rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
      const fake = createFakeContext();

      await expect(
        createTopic(null as never, { input: CREATE_TOPIC_INPUT } as never, fake as unknown as GraphQLContext),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Authentication required' });

      expect(fake.services.parent.getParentInfo).not.toHaveBeenCalled();
      expect(fake.clients.questionsClient.createTopic.post).not.toHaveBeenCalled();
    });

    test('resolves parent info, checks ownership and forwards the create payload', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.services.parent.getParentInfo.mockImplementation(async () => ({
        grandParentId: 'business-1',
        ownerId: 'owner-1',
        ownerType: 'user',
      }));
      fake.clients.questionsClient.createTopic.post.mockImplementation(async () => edenOk(TOPIC));

      const result = await createTopic(
        null as never,
        { input: CREATE_TOPIC_INPUT } as never,
        fake as unknown as GraphQLContext,
      );

      expect(fake.services.parent.getParentInfo).toHaveBeenCalledWith('business', 'business-1', 'user-1');
      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
        userId: 'user-1',
        ownerId: 'owner-1',
        ownerType: 'user',
        permission: 'content',
      });
      expect(fake.clients.questionsClient.createTopic.post).toHaveBeenCalledWith({
        name: 'Getting started',
        ownerId: 'owner-1',
        ownerType: 'user',
        creator: 'user-1',
        parentId: 'business-1',
        grandParentId: 'business-1',
      });
      expect(result).toEqual(TOPIC);
    });

    test('propagates an ownership rejection and never calls the client', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.services.ownership.checkOwnership.mockImplementationOnce(async () => {
        throw new AppError({ message: 'Forbidden', statusCode: 403, code: 'FORBIDDEN' });
      });

      await expect(
        createTopic(null as never, { input: CREATE_TOPIC_INPUT } as never, fake as unknown as GraphQLContext),
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

      expect(fake.clients.questionsClient.createTopic.post).not.toHaveBeenCalled();
    });

    test('maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.questionsClient.createTopic.post.mockImplementation(async () => edenError(500));

      await expect(
        createTopic(null as never, { input: CREATE_TOPIC_INPUT } as never, fake as unknown as GraphQLContext),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to create topic' });

      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateTopic', () => {
    test('rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
      const fake = createFakeContext();

      await expect(
        updateTopic(null as never, { input: UPDATE_TOPIC_INPUT } as never, fake as unknown as GraphQLContext),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Authentication required' });

      expect(fake.clients.questionsClient.getTopic.post).not.toHaveBeenCalled();
      expect(fake.clients.questionsClient.updateTopic.post).not.toHaveBeenCalled();
    });

    test('fetches the topic, checks ownership and forwards the update payload', async () => {
      const fake = createFakeContext({ user: fakeUser });
      const updated = { ...TOPIC, name: 'Renamed topic' };
      fake.clients.questionsClient.getTopic.post.mockImplementation(async () => edenOk(TOPIC));
      fake.clients.questionsClient.updateTopic.post.mockImplementation(async () => edenOk(updated));

      const result = await updateTopic(
        null as never,
        { input: UPDATE_TOPIC_INPUT } as never,
        fake as unknown as GraphQLContext,
      );

      expect(fake.clients.questionsClient.getTopic.post).toHaveBeenCalledWith({ id: 'topic-1' });
      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
        userId: 'user-1',
        ownerId: 'owner-1',
        ownerType: 'business',
        permission: 'content',
      });
      expect(fake.clients.questionsClient.updateTopic.post).toHaveBeenCalledWith({
        id: 'topic-1',
        updateData: { name: 'Renamed topic' },
      });
      expect(result).toEqual(updated);
    });

    test('maps a failed topic lookup to 502 BAD_GATEWAY and skips the update', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.questionsClient.getTopic.post.mockImplementation(async () => edenError(404));

      await expect(
        updateTopic(null as never, { input: UPDATE_TOPIC_INPUT } as never, fake as unknown as GraphQLContext),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to get topic data' });

      expect(fake.services.ownership.checkOwnership).not.toHaveBeenCalled();
      expect(fake.clients.questionsClient.updateTopic.post).not.toHaveBeenCalled();
    });

    test('maps a failed update to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.questionsClient.getTopic.post.mockImplementation(async () => edenOk(TOPIC));
      fake.clients.questionsClient.updateTopic.post.mockImplementation(async () => edenError(500));

      await expect(
        updateTopic(null as never, { input: UPDATE_TOPIC_INPUT } as never, fake as unknown as GraphQLContext),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to update topic' });
    });
  });

  describe('deleteTopic', () => {
    test('rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
      const fake = createFakeContext();

      await expect(
        deleteTopic(null as never, { id: 'topic-1' } as never, fake as unknown as GraphQLContext),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Authentication required' });

      expect(fake.clients.questionsClient.deleteTopic.post).not.toHaveBeenCalled();
    });

    test('fetches the topic, checks ownership and returns the deleted id', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.questionsClient.getTopic.post.mockImplementation(async () => edenOk(TOPIC));
      fake.clients.questionsClient.deleteTopic.post.mockImplementation(async () => edenOk({ id: 'topic-1' }));

      const result = await deleteTopic(null as never, { id: 'topic-1' } as never, fake as unknown as GraphQLContext);

      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
        userId: 'user-1',
        ownerId: 'owner-1',
        ownerType: 'business',
        permission: 'content',
      });
      expect(fake.clients.questionsClient.deleteTopic.post).toHaveBeenCalledWith({ id: 'topic-1' });
      expect(result).toBe('topic-1');
    });

    test('maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.questionsClient.getTopic.post.mockImplementation(async () => edenOk(TOPIC));
      fake.clients.questionsClient.deleteTopic.post.mockImplementation(async () => edenError(500));

      await expect(
        deleteTopic(null as never, { id: 'topic-1' } as never, fake as unknown as GraphQLContext),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to delete topic' });
    });
  });

  describe('createQuestion', () => {
    test('rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
      const fake = createFakeContext();

      await expect(
        createQuestion(null as never, { input: CREATE_QUESTION_INPUT } as never, fake as unknown as GraphQLContext),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Authentication required' });

      expect(fake.clients.questionsClient.getTopic.post).not.toHaveBeenCalled();
      expect(fake.clients.questionsClient.createQuestion.post).not.toHaveBeenCalled();
    });

    test('fetches the topic, checks ownership and forwards the create payload', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.questionsClient.getTopic.post.mockImplementation(async () => edenOk(TOPIC));
      fake.clients.questionsClient.createQuestion.post.mockImplementation(async () => edenOk(QUESTION));

      const result = await createQuestion(
        null as never,
        { input: CREATE_QUESTION_INPUT } as never,
        fake as unknown as GraphQLContext,
      );

      expect(fake.clients.questionsClient.getTopic.post).toHaveBeenCalledWith({ id: 'topic-1' });
      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
        userId: 'user-1',
        ownerId: 'owner-1',
        ownerType: 'business',
        permission: 'content',
      });
      expect(fake.clients.questionsClient.createQuestion.post).toHaveBeenCalledWith({
        topicId: 'topic-1',
        text: 'What is HOLD?',
        ownerId: 'owner-1',
        ownerType: 'business',
        creator: 'user-1',
        parentId: 'business-1',
        grandParentId: 'business-1',
      });
      expect(result).toEqual(QUESTION);
    });

    test('propagates an ownership rejection and never calls the client', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.questionsClient.getTopic.post.mockImplementation(async () => edenOk(TOPIC));
      fake.services.ownership.checkOwnership.mockImplementationOnce(async () => {
        throw new AppError({ message: 'Forbidden', statusCode: 403, code: 'FORBIDDEN' });
      });

      await expect(
        createQuestion(null as never, { input: CREATE_QUESTION_INPUT } as never, fake as unknown as GraphQLContext),
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

      expect(fake.clients.questionsClient.createQuestion.post).not.toHaveBeenCalled();
    });

    test('maps a failed topic lookup to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.questionsClient.getTopic.post.mockImplementation(async () => edenError(404));

      await expect(
        createQuestion(null as never, { input: CREATE_QUESTION_INPUT } as never, fake as unknown as GraphQLContext),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to get topic data' });

      expect(fake.services.ownership.checkOwnership).not.toHaveBeenCalled();
      expect(fake.clients.questionsClient.createQuestion.post).not.toHaveBeenCalled();
    });

    test('maps a failed create to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.questionsClient.getTopic.post.mockImplementation(async () => edenOk(TOPIC));
      fake.clients.questionsClient.createQuestion.post.mockImplementation(async () => edenError(500));

      await expect(
        createQuestion(null as never, { input: CREATE_QUESTION_INPUT } as never, fake as unknown as GraphQLContext),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to create question' });
    });
  });

  describe('updateQuestionText', () => {
    test('rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
      const fake = createFakeContext();

      await expect(
        updateQuestionText(
          null as never,
          { input: UPDATE_QUESTION_TEXT_INPUT } as never,
          fake as unknown as GraphQLContext,
        ),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Authentication required' });

      expect(fake.clients.questionsClient.updateQuestionText.post).not.toHaveBeenCalled();
    });

    test('fetches the question, checks ownership and forwards the update payload', async () => {
      const fake = createFakeContext({ user: fakeUser });
      const updated = { ...QUESTION, text: 'What is HOLD exactly?' };
      fake.clients.questionsClient.getQuestion.post.mockImplementation(async () => edenOk(QUESTION));
      fake.clients.questionsClient.updateQuestionText.post.mockImplementation(async () => edenOk(updated));

      const result = await updateQuestionText(
        null as never,
        { input: UPDATE_QUESTION_TEXT_INPUT } as never,
        fake as unknown as GraphQLContext,
      );

      expect(fake.clients.questionsClient.getQuestion.post).toHaveBeenCalledWith({ id: 'question-1' });
      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
        userId: 'user-1',
        ownerId: 'owner-1',
        ownerType: 'business',
        permission: 'content',
      });
      expect(fake.clients.questionsClient.updateQuestionText.post).toHaveBeenCalledWith({
        id: 'question-1',
        updateData: { text: 'What is HOLD exactly?' },
      });
      expect(result).toEqual(updated);
    });

    test('maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.questionsClient.getQuestion.post.mockImplementation(async () => edenOk(QUESTION));
      fake.clients.questionsClient.updateQuestionText.post.mockImplementation(async () => edenError(500));

      await expect(
        updateQuestionText(
          null as never,
          { input: UPDATE_QUESTION_TEXT_INPUT } as never,
          fake as unknown as GraphQLContext,
        ),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to update question text' });
    });
  });

  describe('createQuestionAnswer', () => {
    test('rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
      const fake = createFakeContext();

      await expect(
        createQuestionAnswer(
          null as never,
          { input: CREATE_QUESTION_ANSWER_INPUT } as never,
          fake as unknown as GraphQLContext,
        ),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Authentication required' });

      expect(fake.clients.questionsClient.createQuestionAnswer.post).not.toHaveBeenCalled();
    });

    test('fetches the question, checks ownership and forwards the answer payload', async () => {
      const fake = createFakeContext({ user: fakeUser });
      const answered = { ...QUESTION, answered: true, answer: ANSWER };
      fake.clients.questionsClient.getQuestion.post.mockImplementation(async () => edenOk(QUESTION));
      fake.clients.questionsClient.createQuestionAnswer.post.mockImplementation(async () => edenOk(answered));

      const result = await createQuestionAnswer(
        null as never,
        { input: CREATE_QUESTION_ANSWER_INPUT } as never,
        fake as unknown as GraphQLContext,
      );

      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
        userId: 'user-1',
        ownerId: 'owner-1',
        ownerType: 'business',
        permission: 'content',
      });
      expect(fake.clients.questionsClient.createQuestionAnswer.post).toHaveBeenCalledWith({
        id: 'question-1',
        userId: 'user-1',
        text: 'The platform token.',
      });
      expect(result).toEqual(answered);
    });

    test('maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.questionsClient.getQuestion.post.mockImplementation(async () => edenOk(QUESTION));
      fake.clients.questionsClient.createQuestionAnswer.post.mockImplementation(async () => edenError(500));

      await expect(
        createQuestionAnswer(
          null as never,
          { input: CREATE_QUESTION_ANSWER_INPUT } as never,
          fake as unknown as GraphQLContext,
        ),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to create question answer' });
    });
  });

  describe('updateQuestionAnswer', () => {
    test('rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
      const fake = createFakeContext();

      await expect(
        updateQuestionAnswer(
          null as never,
          { input: UPDATE_QUESTION_ANSWER_INPUT } as never,
          fake as unknown as GraphQLContext,
        ),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Authentication required' });

      expect(fake.clients.questionsClient.updateQuestionAnswer.post).not.toHaveBeenCalled();
    });

    test('fetches the question, checks ownership and forwards the update payload', async () => {
      const fake = createFakeContext({ user: fakeUser });
      const updated = { ...QUESTION, answered: true, answer: { ...ANSWER, text: 'The platform utility token.' } };
      fake.clients.questionsClient.getQuestion.post.mockImplementation(async () => edenOk(QUESTION));
      fake.clients.questionsClient.updateQuestionAnswer.post.mockImplementation(async () => edenOk(updated));

      const result = await updateQuestionAnswer(
        null as never,
        { input: UPDATE_QUESTION_ANSWER_INPUT } as never,
        fake as unknown as GraphQLContext,
      );

      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
        userId: 'user-1',
        ownerId: 'owner-1',
        ownerType: 'business',
        permission: 'content',
      });
      expect(fake.clients.questionsClient.updateQuestionAnswer.post).toHaveBeenCalledWith({
        id: 'question-1',
        updateData: { text: 'The platform utility token.' },
      });
      expect(result).toEqual(updated);
    });

    test('maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.questionsClient.getQuestion.post.mockImplementation(async () => edenOk(QUESTION));
      fake.clients.questionsClient.updateQuestionAnswer.post.mockImplementation(async () => edenError(500));

      await expect(
        updateQuestionAnswer(
          null as never,
          { input: UPDATE_QUESTION_ANSWER_INPUT } as never,
          fake as unknown as GraphQLContext,
        ),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to update question answer' });
    });
  });

  describe('deleteQuestion', () => {
    test('rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
      const fake = createFakeContext();

      await expect(
        deleteQuestion(null as never, { id: 'question-1' } as never, fake as unknown as GraphQLContext),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Authentication required' });

      expect(fake.clients.questionsClient.deleteQuestion.post).not.toHaveBeenCalled();
    });

    test('fetches the question, checks ownership and returns the deleted id', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.questionsClient.getQuestion.post.mockImplementation(async () => edenOk(QUESTION));
      fake.clients.questionsClient.deleteQuestion.post.mockImplementation(async () => edenOk({ id: 'question-1' }));

      const result = await deleteQuestion(
        null as never,
        { id: 'question-1' } as never,
        fake as unknown as GraphQLContext,
      );

      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
        userId: 'user-1',
        ownerId: 'owner-1',
        ownerType: 'business',
        permission: 'content',
      });
      expect(fake.clients.questionsClient.deleteQuestion.post).toHaveBeenCalledWith({ id: 'question-1' });
      expect(result).toBe('question-1');
    });

    test('maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.questionsClient.getQuestion.post.mockImplementation(async () => edenOk(QUESTION));
      fake.clients.questionsClient.deleteQuestion.post.mockImplementation(async () => edenError(500));

      await expect(
        deleteQuestion(null as never, { id: 'question-1' } as never, fake as unknown as GraphQLContext),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to delete question' });
    });
  });

  describe('toggleQuestionLike', () => {
    test('rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
      const fake = createFakeContext();

      await expect(
        toggleQuestionLike(null as never, { questionId: 'question-1' } as never, fake as unknown as GraphQLContext),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Authentication required' });

      expect(fake.clients.questionsClient.toggleQuestionLike.post).not.toHaveBeenCalled();
    });

    test('forwards the question id and the caller, returning the like state', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.questionsClient.toggleQuestionLike.post.mockImplementation(async () => edenOk({ liked: true }));

      const result = await toggleQuestionLike(
        null as never,
        { questionId: 'question-1' } as never,
        fake as unknown as GraphQLContext,
      );

      expect(fake.clients.questionsClient.toggleQuestionLike.post).toHaveBeenCalledWith({
        questionId: 'question-1',
        userId: 'user-1',
      });
      expect(result).toBe(true);
    });

    test('returns false when the upstream reports an unliked state', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.questionsClient.toggleQuestionLike.post.mockImplementation(async () => edenOk({ liked: false }));

      const result = await toggleQuestionLike(
        null as never,
        { questionId: 'question-1' } as never,
        fake as unknown as GraphQLContext,
      );

      expect(result).toBe(false);
    });

    test('maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.questionsClient.toggleQuestionLike.post.mockImplementation(async () => edenError(500));

      await expect(
        toggleQuestionLike(null as never, { questionId: 'question-1' } as never, fake as unknown as GraphQLContext),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to toggle question like' });
    });
  });
});
