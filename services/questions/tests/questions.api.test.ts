/**
 * Component tests for the questions HTTP layer.
 *
 * The whole Elysia app is assembled in-process: real controllers and the real
 * QuestionsService, with repositories replaced by in-memory fakes. Requests go
 * through app.handle() — no port is bound, nothing is queried over the network.
 * Run with `bun test` from services/questions.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { ErrorHandlerPlugin } from '@shared/errors/error-handler.plugin';
import { createServicesPlugin } from '../src/plugins/services.plugin';
import { createControllersPlugin } from '../src/plugins/controllers.plugin';
import type { RepositoriesPlugin } from '../src/plugins/repositories.plugin';
import { createFakeTopicRepository, type FakeTopicRepository } from './fakes/topic.repository.fake';
import { createFakeQuestionRepository, type FakeQuestionRepository } from './fakes/question.repository.fake';
import {
  createFakeQuestionLikesRepository,
  type FakeQuestionLikesRepository,
} from './fakes/questionLikes.repository.fake';

const TOPIC = {
  name: 'Getting started',
  ownerId: 'owner-1',
  ownerType: 'business',
  creator: 'user-1',
  parentId: 'parent-1',
  grandParentId: 'grand-1',
};

const QUESTION = {
  text: 'How does staking work?',
  ownerId: 'owner-1',
  ownerType: 'business',
  creator: 'user-1',
  parentId: 'parent-1',
  grandParentId: 'grand-1',
};

const ANSWER = {
  userId: 'user-2',
  text: 'Stake HOLD and wait for the next epoch.',
};

function buildApp(topics: FakeTopicRepository, questions: FakeQuestionRepository, likes: FakeQuestionLikesRepository) {
  const repositoriesPlugin = new Elysia({ name: 'Repositories' })
    .decorate('topicRepository', topics)
    .decorate('questionRepository', questions)
    .decorate('questionLikesRepository', likes);

  const servicesPlugin = createServicesPlugin(repositoriesPlugin as unknown as RepositoriesPlugin);

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

describe('questions HTTP layer (component, fake repositories)', () => {
  let topics: FakeTopicRepository;
  let questions: FakeQuestionRepository;
  let likes: FakeQuestionLikesRepository;
  let app: App;

  beforeEach(() => {
    topics = createFakeTopicRepository();
    questions = createFakeQuestionRepository();
    likes = createFakeQuestionLikesRepository();
    app = buildApp(topics, questions, likes);
  });

  test('createTopic → getTopic → getTopics round-trip', async () => {
    const created = await post(app, '/createTopic', TOPIC);
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ name: TOPIC.name, ownerId: TOPIC.ownerId });
    expect(typeof created.body.id).toBe('string');

    const fetched = await post(app, '/getTopic', { id: created.body.id });
    expect(fetched.status).toBe(200);
    expect(fetched.body).toEqual(created.body);

    const list = await post(app, '/getTopics', { filter: {} });
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(created.body.id);
  });

  test('updateTopic: rename is visible through getTopic', async () => {
    const created = await post(app, '/createTopic', TOPIC);

    const updated = await post(app, '/updateTopic', { id: created.body.id, updateData: { name: 'Renamed' } });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe('Renamed');

    const fetched = await post(app, '/getTopic', { id: created.body.id });
    expect(fetched.body.name).toBe('Renamed');
  });

  test('createQuestion → getQuestion → getQuestions round-trip', async () => {
    const topic = (await post(app, '/createTopic', TOPIC)).body;

    const created = await post(app, '/createQuestion', { ...QUESTION, topicId: topic.id });
    expect(created.status).toBe(200);
    expect(created.body.topicId).toBe(topic.id);
    expect(created.body.answered).toBe(false);
    expect(created.body.likesCount).toBe(0);
    expect(typeof created.body.id).toBe('string');

    const fetched = await post(app, '/getQuestion', { id: created.body.id });
    expect(fetched.status).toBe(200);
    expect(fetched.body).toEqual(created.body);

    const list = await post(app, '/getQuestions', { filter: { topicId: topic.id } });
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(created.body.id);
  });

  test('updateQuestionText: the new text is visible through getQuestion', async () => {
    const topic = (await post(app, '/createTopic', TOPIC)).body;
    const question = (await post(app, '/createQuestion', { ...QUESTION, topicId: topic.id })).body;

    const updated = await post(app, '/updateQuestionText', { id: question.id, updateData: { text: 'Updated?' } });
    expect(updated.status).toBe(200);
    expect(updated.body.text).toBe('Updated?');

    const fetched = await post(app, '/getQuestion', { id: question.id });
    expect(fetched.body.text).toBe('Updated?');
  });

  test('answer flow: createQuestionAnswer → updateQuestionAnswer → getQuestion', async () => {
    const topic = (await post(app, '/createTopic', TOPIC)).body;
    const question = (await post(app, '/createQuestion', { ...QUESTION, topicId: topic.id })).body;

    const answered = await post(app, '/createQuestionAnswer', { id: question.id, ...ANSWER });
    expect(answered.status).toBe(200);
    expect(answered.body.answered).toBe(true);
    expect(answered.body.answer).toMatchObject({ userId: ANSWER.userId, text: ANSWER.text });

    const revised = await post(app, '/updateQuestionAnswer', { id: question.id, updateData: { text: 'Revised.' } });
    expect(revised.status).toBe(200);
    expect(revised.body.answer.text).toBe('Revised.');

    const fetched = await post(app, '/getQuestion', { id: question.id });
    expect(fetched.body.answer.text).toBe('Revised.');
  });

  test('toggleQuestionLike: toggles the like and the question counter', async () => {
    const topic = (await post(app, '/createTopic', TOPIC)).body;
    const question = (await post(app, '/createQuestion', { ...QUESTION, topicId: topic.id })).body;

    const liked = await post(app, '/toggleQuestionLike', { questionId: question.id, userId: 'user-2' });
    expect(liked.status).toBe(200);
    expect(liked.body).toEqual({ liked: true });

    const afterLike = await post(app, '/getQuestion', { id: question.id });
    expect(afterLike.body.likesCount).toBe(1);

    const unliked = await post(app, '/toggleQuestionLike', { questionId: question.id, userId: 'user-2' });
    expect(unliked.status).toBe(200);
    expect(unliked.body).toEqual({ liked: false });

    const afterUnlike = await post(app, '/getQuestion', { id: question.id });
    expect(afterUnlike.body.likesCount).toBe(0);
  });

  test('deleteQuestion: an unknown id maps to 404 NOT_FOUND', async () => {
    const response = await post(app, '/deleteQuestion', { id: 'unknown-id' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Question unknown-id not found' } });
  });

  test('deleteTopic: removes the topic and its questions', async () => {
    const topic = (await post(app, '/createTopic', TOPIC)).body;
    const otherTopic = (await post(app, '/createTopic', { ...TOPIC, name: 'Other' })).body;
    const mine = (await post(app, '/createQuestion', { ...QUESTION, topicId: topic.id })).body;
    const foreign = (await post(app, '/createQuestion', { ...QUESTION, topicId: otherTopic.id, text: 'Foreign?' }))
      .body;

    const deleted = await post(app, '/deleteTopic', { id: topic.id });
    expect(deleted.status).toBe(200);

    const gone = await post(app, '/getTopic', { id: topic.id });
    expect(gone.status).toBe(404);
    expect(gone.body).toEqual({ error: { code: 'NOT_FOUND', message: `Topic ${topic.id} not found` } });

    const remaining = await post(app, '/getQuestions', { filter: {} });
    expect(remaining.status).toBe(200);
    expect(remaining.body).toHaveLength(1);
    expect(remaining.body[0].id).toBe(foreign.id);
    expect(questions.store.has(mine.id)).toBe(false);
  });

  test('createQuestion: an invalid payload never reaches the repository', async () => {
    const response = await post(app, '/createQuestion', { text: 'Missing everything else' });

    expect(response.status).not.toBe(200);
    expect(questions.create).toHaveBeenCalledTimes(0);
  });
});
