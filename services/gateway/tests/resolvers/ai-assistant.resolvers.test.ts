/**
 * Isolated resolver tests for the ai-assistant GraphQL module.
 *
 * Resolvers are plain functions called directly with a fake GraphQLContext
 * (tests/fakes/context.fake.ts + clients.fake.ts), so nothing leaves the
 * process: no network, no database, no broker, no ports.
 *
 * Ownership in this module is enforced against the upstream ai-assistant
 * service (getAssistant/getMessage followed by a userId comparison), not
 * through services.ownership, so the ownership cases below assert that flow.
 */
import { describe, expect, test } from 'bun:test';
import type { GraphQLContext } from '../../src/graphql/context/types';
import { createFakeContext, fakeUser, type FakeContext } from '../fakes/context.fake';
import { edenError, edenOk } from '../fakes/clients.fake';
import { createAssistant } from '../../src/graphql/modules/ai-assistant/resolvers/mutations/createAssistant';
import { updateAssistant } from '../../src/graphql/modules/ai-assistant/resolvers/mutations/updateAssistant';
import { deleteAssistant } from '../../src/graphql/modules/ai-assistant/resolvers/mutations/deleteAssistant';
import { createMessage } from '../../src/graphql/modules/ai-assistant/resolvers/mutations/createMessage';
import { updateMessage } from '../../src/graphql/modules/ai-assistant/resolvers/mutations/updateMessage';
import { deleteMessage } from '../../src/graphql/modules/ai-assistant/resolvers/mutations/deleteMessage';
import { getAssistant } from '../../src/graphql/modules/ai-assistant/resolvers/queries/getAssistant';
import { getUserAssistants } from '../../src/graphql/modules/ai-assistant/resolvers/queries/getUserAssistants';
import { getMessage } from '../../src/graphql/modules/ai-assistant/resolvers/queries/getMessage';
import { getMessageHistory } from '../../src/graphql/modules/ai-assistant/resolvers/queries/getMessageHistory';

const asContext = (fake: FakeContext) => fake as unknown as GraphQLContext;

const ASSISTANT = {
  id: 'assistant-1',
  name: 'Research bot',
  userId: fakeUser.id,
  contextPreferences: ['investor_base'],
};

const FOREIGN_ASSISTANT = { ...ASSISTANT, id: 'assistant-2', userId: 'user-2' };

const MESSAGE = {
  id: 'message-1',
  assistantId: 'assistant-1',
  text: 'Hello',
  sender: 'user',
};

describe('ai-assistant resolvers (unit, fake clients)', () => {
  describe('createAssistant', () => {
    test('creates the assistant for the authenticated user and returns the mapped assistant', async () => {
      const fake = createFakeContext({ user: fakeUser });
      const created = { ...ASSISTANT, createdAt: 1700000000 };
      fake.clients.aiAssistantClient.createAssistant.post.mockImplementation(async () => edenOk(created));

      const result = await createAssistant(
        null as never,
        { input: { name: 'Research bot', contextPreferences: ['investor_base'] } } as never,
        asContext(fake),
      );

      expect(fake.clients.aiAssistantClient.createAssistant.post).toHaveBeenCalledTimes(1);
      expect(fake.clients.aiAssistantClient.createAssistant.post).toHaveBeenCalledWith({
        name: 'Research bot',
        userId: fakeUser.id,
        contextPreferences: ['investor_base'],
      });
      // Only the four mapped fields reach GraphQL; upstream extras (createdAt) are dropped.
      expect(result).toEqual(ASSISTANT);
    });

    test('defaults contextPreferences to an empty array when omitted', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.aiAssistantClient.createAssistant.post.mockImplementation(async () => edenOk(ASSISTANT));

      // The GraphQL input declares contextPreferences as non-null; the resolver
      // default is a guard for direct calls, kept faithful in this unit test.
      const result = await createAssistant(
        null as never,
        { input: { name: 'Research bot' } } as never,
        asContext(fake),
      );

      expect(fake.clients.aiAssistantClient.createAssistant.post).toHaveBeenCalledWith({
        name: 'Research bot',
        userId: fakeUser.id,
        contextPreferences: [],
      });
      expect(result).toEqual(ASSISTANT);
    });

    test('rejects an anonymous caller with 401 UNAUTHORIZED without calling the service', async () => {
      const fake = createFakeContext();

      await expect(
        createAssistant(
          null as never,
          { input: { name: 'Research bot', contextPreferences: [] } } as never,
          asContext(fake),
        ),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

      expect(fake.clients.aiAssistantClient.createAssistant.post).toHaveBeenCalledTimes(0);
    });

    test('maps an upstream failure to 502 UPSTREAM_ERROR', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.aiAssistantClient.createAssistant.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      // Note: this resolver maps upstream failures to code UPSTREAM_ERROR,
      // unlike its sibling resolvers which use BAD_GATEWAY (kept faithful to src).
      await expect(
        createAssistant(
          null as never,
          { input: { name: 'Research bot', contextPreferences: [] } } as never,
          asContext(fake),
        ),
      ).rejects.toMatchObject({ statusCode: 502, code: 'UPSTREAM_ERROR' });
    });
  });

  describe('updateAssistant', () => {
    const updated = { ...ASSISTANT, name: 'Renamed', contextPreferences: ['popular_pools'] };

    test('verifies ownership, forwards the update and returns the mapped assistant', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.aiAssistantClient.getAssistant.post.mockImplementation(async () => edenOk(ASSISTANT));
      fake.clients.aiAssistantClient.updateAssistant.post.mockImplementation(async () => edenOk(updated));

      const result = await updateAssistant(
        null as never,
        { input: { id: 'assistant-1', name: 'Renamed', contextPreferences: ['popular_pools'] } } as never,
        asContext(fake),
      );

      expect(fake.clients.aiAssistantClient.getAssistant.post).toHaveBeenCalledWith({ id: 'assistant-1' });
      expect(fake.clients.aiAssistantClient.updateAssistant.post).toHaveBeenCalledWith({
        id: 'assistant-1',
        name: 'Renamed',
        contextPreferences: ['popular_pools'],
      });
      expect(result).toEqual(updated);
    });

    test('rejects an anonymous caller with 401 UNAUTHORIZED without calling the service', async () => {
      const fake = createFakeContext();

      await expect(
        updateAssistant(null as never, { input: { id: 'assistant-1', name: 'Renamed' } } as never, asContext(fake)),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

      expect(fake.clients.aiAssistantClient.getAssistant.post).toHaveBeenCalledTimes(0);
      expect(fake.clients.aiAssistantClient.updateAssistant.post).toHaveBeenCalledTimes(0);
    });

    test("rejects updating another user's assistant with 403 FORBIDDEN and does not call update", async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.aiAssistantClient.getAssistant.post.mockImplementation(async () => edenOk(FOREIGN_ASSISTANT));

      await expect(
        updateAssistant(null as never, { input: { id: 'assistant-2', name: 'Renamed' } } as never, asContext(fake)),
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

      expect(fake.clients.aiAssistantClient.updateAssistant.post).toHaveBeenCalledTimes(0);
    });

    test('maps a failed ownership lookup to 403 FORBIDDEN and does not call update', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.aiAssistantClient.getAssistant.post.mockImplementation(async () =>
        edenError(404, 'NOT_FOUND', 'no assistant'),
      );

      await expect(
        updateAssistant(null as never, { input: { id: 'assistant-1', name: 'Renamed' } } as never, asContext(fake)),
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

      expect(fake.clients.aiAssistantClient.updateAssistant.post).toHaveBeenCalledTimes(0);
    });

    test('maps an upstream update failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.aiAssistantClient.getAssistant.post.mockImplementation(async () => edenOk(ASSISTANT));
      fake.clients.aiAssistantClient.updateAssistant.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(
        updateAssistant(null as never, { input: { id: 'assistant-1', name: 'Renamed' } } as never, asContext(fake)),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
    });
  });

  describe('deleteAssistant', () => {
    test('verifies ownership, deletes by id and returns only the id', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.aiAssistantClient.getAssistant.post.mockImplementation(async () => edenOk(ASSISTANT));
      fake.clients.aiAssistantClient.deleteAssistant.post.mockImplementation(async () =>
        edenOk({ id: 'assistant-1', deletedAt: 1700000000 }),
      );

      const result = await deleteAssistant(null as never, { id: 'assistant-1' } as never, asContext(fake));

      expect(fake.clients.aiAssistantClient.getAssistant.post).toHaveBeenCalledWith({ id: 'assistant-1' });
      expect(fake.clients.aiAssistantClient.deleteAssistant.post).toHaveBeenCalledWith({ id: 'assistant-1' });
      expect(result).toEqual({ id: 'assistant-1' });
    });

    test('rejects an anonymous caller with 401 UNAUTHORIZED without calling the service', async () => {
      const fake = createFakeContext();

      await expect(
        deleteAssistant(null as never, { id: 'assistant-1' } as never, asContext(fake)),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

      expect(fake.clients.aiAssistantClient.deleteAssistant.post).toHaveBeenCalledTimes(0);
    });

    test("rejects deleting another user's assistant with 403 FORBIDDEN and does not call delete", async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.aiAssistantClient.getAssistant.post.mockImplementation(async () => edenOk(FOREIGN_ASSISTANT));

      await expect(
        deleteAssistant(null as never, { id: 'assistant-2' } as never, asContext(fake)),
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

      expect(fake.clients.aiAssistantClient.deleteAssistant.post).toHaveBeenCalledTimes(0);
    });

    test('maps an upstream delete failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.aiAssistantClient.getAssistant.post.mockImplementation(async () => edenOk(ASSISTANT));
      fake.clients.aiAssistantClient.deleteAssistant.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(
        deleteAssistant(null as never, { id: 'assistant-1' } as never, asContext(fake)),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
    });
  });

  describe('createMessage', () => {
    test('verifies assistant ownership, forwards the message and returns every mapped message', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.aiAssistantClient.getAssistant.post.mockImplementation(async () => edenOk(ASSISTANT));
      const created = [
        { ...MESSAGE, createdAt: 1700000000 },
        { id: 'message-2', assistantId: 'assistant-1', text: 'Hi there', sender: 'assistant', createdAt: 1700000001 },
      ];
      fake.clients.aiAssistantClient.createMessage.post.mockImplementation(async () => edenOk(created));

      const result = await createMessage(
        null as never,
        { input: { assistantId: 'assistant-1', text: 'Hello' } } as never,
        asContext(fake),
      );

      expect(fake.clients.aiAssistantClient.getAssistant.post).toHaveBeenCalledWith({ id: 'assistant-1' });
      expect(fake.clients.aiAssistantClient.createMessage.post).toHaveBeenCalledWith({
        assistantId: 'assistant-1',
        text: 'Hello',
      });
      expect(result).toEqual([
        MESSAGE,
        { id: 'message-2', assistantId: 'assistant-1', text: 'Hi there', sender: 'assistant' },
      ]);
    });

    test('rejects an anonymous caller with 401 UNAUTHORIZED without calling the service', async () => {
      const fake = createFakeContext();

      await expect(
        createMessage(
          null as never,
          { input: { assistantId: 'assistant-1', text: 'Hello' } } as never,
          asContext(fake),
        ),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

      expect(fake.clients.aiAssistantClient.createMessage.post).toHaveBeenCalledTimes(0);
    });

    test("rejects messaging another user's assistant with 403 FORBIDDEN and does not create the message", async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.aiAssistantClient.getAssistant.post.mockImplementation(async () => edenOk(FOREIGN_ASSISTANT));

      await expect(
        createMessage(
          null as never,
          { input: { assistantId: 'assistant-2', text: 'Hello' } } as never,
          asContext(fake),
        ),
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

      expect(fake.clients.aiAssistantClient.createMessage.post).toHaveBeenCalledTimes(0);
    });

    test('maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.aiAssistantClient.getAssistant.post.mockImplementation(async () => edenOk(ASSISTANT));
      fake.clients.aiAssistantClient.createMessage.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(
        createMessage(
          null as never,
          { input: { assistantId: 'assistant-1', text: 'Hello' } } as never,
          asContext(fake),
        ),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
    });
  });

  describe('updateMessage', () => {
    test('fetches the message, verifies the assistant owner and returns the mapped message', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.aiAssistantClient.getMessage.post.mockImplementation(async () =>
        edenOk({ ...MESSAGE, createdAt: 1700000000 }),
      );
      fake.clients.aiAssistantClient.getAssistant.post.mockImplementation(async () => edenOk(ASSISTANT));
      const updated = { ...MESSAGE, text: 'Updated' };
      fake.clients.aiAssistantClient.updateMessage.post.mockImplementation(async () => edenOk(updated));

      const result = await updateMessage(
        null as never,
        { input: { id: 'message-1', text: 'Updated' } } as never,
        asContext(fake),
      );

      expect(fake.clients.aiAssistantClient.getMessage.post).toHaveBeenCalledWith({ id: 'message-1' });
      // The assistant id is derived from the fetched message, not from the input.
      expect(fake.clients.aiAssistantClient.getAssistant.post).toHaveBeenCalledWith({ id: MESSAGE.assistantId });
      expect(fake.clients.aiAssistantClient.updateMessage.post).toHaveBeenCalledWith({
        id: 'message-1',
        text: 'Updated',
      });
      expect(result).toEqual(updated);
    });

    test('rejects an anonymous caller with 401 UNAUTHORIZED without calling the service', async () => {
      const fake = createFakeContext();

      await expect(
        updateMessage(null as never, { input: { id: 'message-1', text: 'Updated' } } as never, asContext(fake)),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

      expect(fake.clients.aiAssistantClient.getMessage.post).toHaveBeenCalledTimes(0);
      expect(fake.clients.aiAssistantClient.updateMessage.post).toHaveBeenCalledTimes(0);
    });

    test('maps a failed message lookup to 502 BAD_GATEWAY before any ownership check', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.aiAssistantClient.getMessage.post.mockImplementation(async () =>
        edenError(404, 'NOT_FOUND', 'no message'),
      );

      await expect(
        updateMessage(null as never, { input: { id: 'message-1', text: 'Updated' } } as never, asContext(fake)),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });

      expect(fake.clients.aiAssistantClient.getAssistant.post).toHaveBeenCalledTimes(0);
      expect(fake.clients.aiAssistantClient.updateMessage.post).toHaveBeenCalledTimes(0);
    });

    test("rejects updating a message of another user's assistant with 403 FORBIDDEN", async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.aiAssistantClient.getMessage.post.mockImplementation(async () => edenOk(MESSAGE));
      fake.clients.aiAssistantClient.getAssistant.post.mockImplementation(async () => edenOk(FOREIGN_ASSISTANT));

      await expect(
        updateMessage(null as never, { input: { id: 'message-1', text: 'Updated' } } as never, asContext(fake)),
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

      expect(fake.clients.aiAssistantClient.updateMessage.post).toHaveBeenCalledTimes(0);
    });

    test('maps an upstream update failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.aiAssistantClient.getMessage.post.mockImplementation(async () => edenOk(MESSAGE));
      fake.clients.aiAssistantClient.getAssistant.post.mockImplementation(async () => edenOk(ASSISTANT));
      fake.clients.aiAssistantClient.updateMessage.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(
        updateMessage(null as never, { input: { id: 'message-1', text: 'Updated' } } as never, asContext(fake)),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
    });
  });

  describe('deleteMessage', () => {
    test('fetches the message, verifies the assistant owner and returns only the id', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.aiAssistantClient.getMessage.post.mockImplementation(async () =>
        edenOk({ ...MESSAGE, createdAt: 1700000000 }),
      );
      fake.clients.aiAssistantClient.getAssistant.post.mockImplementation(async () => edenOk(ASSISTANT));
      fake.clients.aiAssistantClient.deleteMessage.post.mockImplementation(async () =>
        edenOk({ ...MESSAGE, deletedAt: 1700000000 }),
      );

      const result = await deleteMessage(null as never, { id: 'message-1' } as never, asContext(fake));

      expect(fake.clients.aiAssistantClient.getMessage.post).toHaveBeenCalledWith({ id: 'message-1' });
      expect(fake.clients.aiAssistantClient.getAssistant.post).toHaveBeenCalledWith({ id: MESSAGE.assistantId });
      expect(fake.clients.aiAssistantClient.deleteMessage.post).toHaveBeenCalledWith({ id: 'message-1' });
      expect(result).toEqual({ id: 'message-1' });
    });

    test('rejects an anonymous caller with 401 UNAUTHORIZED without calling the service', async () => {
      const fake = createFakeContext();

      await expect(deleteMessage(null as never, { id: 'message-1' } as never, asContext(fake))).rejects.toMatchObject({
        statusCode: 401,
        code: 'UNAUTHORIZED',
      });

      expect(fake.clients.aiAssistantClient.getMessage.post).toHaveBeenCalledTimes(0);
      expect(fake.clients.aiAssistantClient.deleteMessage.post).toHaveBeenCalledTimes(0);
    });

    test('maps a failed message lookup to 502 BAD_GATEWAY before any ownership check', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.aiAssistantClient.getMessage.post.mockImplementation(async () =>
        edenError(404, 'NOT_FOUND', 'no message'),
      );

      await expect(deleteMessage(null as never, { id: 'message-1' } as never, asContext(fake))).rejects.toMatchObject({
        statusCode: 502,
        code: 'BAD_GATEWAY',
      });

      expect(fake.clients.aiAssistantClient.getAssistant.post).toHaveBeenCalledTimes(0);
      expect(fake.clients.aiAssistantClient.deleteMessage.post).toHaveBeenCalledTimes(0);
    });

    test("rejects deleting a message of another user's assistant with 403 FORBIDDEN", async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.aiAssistantClient.getMessage.post.mockImplementation(async () => edenOk(MESSAGE));
      fake.clients.aiAssistantClient.getAssistant.post.mockImplementation(async () => edenOk(FOREIGN_ASSISTANT));

      await expect(deleteMessage(null as never, { id: 'message-1' } as never, asContext(fake))).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
      });

      expect(fake.clients.aiAssistantClient.deleteMessage.post).toHaveBeenCalledTimes(0);
    });

    test('maps an upstream delete failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.aiAssistantClient.getMessage.post.mockImplementation(async () => edenOk(MESSAGE));
      fake.clients.aiAssistantClient.getAssistant.post.mockImplementation(async () => edenOk(ASSISTANT));
      fake.clients.aiAssistantClient.deleteMessage.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(deleteMessage(null as never, { id: 'message-1' } as never, asContext(fake))).rejects.toMatchObject({
        statusCode: 502,
        code: 'BAD_GATEWAY',
      });
    });
  });

  describe('getAssistant', () => {
    test('forwards the id and returns the mapped assistant', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.aiAssistantClient.getAssistant.post.mockImplementation(async () =>
        edenOk({ ...ASSISTANT, createdAt: 1700000000 }),
      );

      const result = await getAssistant(null as never, { id: 'assistant-1' } as never, asContext(fake));

      expect(fake.clients.aiAssistantClient.getAssistant.post).toHaveBeenCalledWith({ id: 'assistant-1' });
      expect(result).toEqual(ASSISTANT);
    });

    test('rejects an anonymous caller with 401 UNAUTHORIZED without calling the service', async () => {
      const fake = createFakeContext();

      await expect(getAssistant(null as never, { id: 'assistant-1' } as never, asContext(fake))).rejects.toMatchObject({
        statusCode: 401,
        code: 'UNAUTHORIZED',
      });

      expect(fake.clients.aiAssistantClient.getAssistant.post).toHaveBeenCalledTimes(0);
    });

    test('maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.aiAssistantClient.getAssistant.post.mockImplementation(async () =>
        edenError(404, 'NOT_FOUND', 'no assistant'),
      );

      await expect(getAssistant(null as never, { id: 'assistant-1' } as never, asContext(fake))).rejects.toMatchObject({
        statusCode: 502,
        code: 'BAD_GATEWAY',
      });
    });

    test("rejects reading another user's assistant with 403 FORBIDDEN after the fetch", async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.aiAssistantClient.getAssistant.post.mockImplementation(async () => edenOk(FOREIGN_ASSISTANT));

      await expect(getAssistant(null as never, { id: 'assistant-2' } as never, asContext(fake))).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
      });

      expect(fake.clients.aiAssistantClient.getAssistant.post).toHaveBeenCalledWith({ id: 'assistant-2' });
    });
  });

  describe('getUserAssistants', () => {
    test('scopes the query to the authenticated user and forwards pagination', async () => {
      const fake = createFakeContext({ user: fakeUser });
      const assistants = [ASSISTANT, { ...ASSISTANT, id: 'assistant-3', name: 'Second bot' }];
      fake.clients.aiAssistantClient.getUserAssistants.post.mockImplementation(async () =>
        edenOk(assistants.map((assistant) => ({ ...assistant, createdAt: 1700000000 }))),
      );

      const result = await getUserAssistants(
        null as never,
        { pagination: { limit: 10, offset: 5 } } as never,
        asContext(fake),
      );

      expect(fake.clients.aiAssistantClient.getUserAssistants.post).toHaveBeenCalledWith({
        userId: fakeUser.id,
        pagination: { limit: 10, offset: 5 },
      });
      expect(result).toEqual(assistants);
    });

    test('rejects an anonymous caller with 401 UNAUTHORIZED without calling the service', async () => {
      const fake = createFakeContext();

      await expect(getUserAssistants(null as never, {} as never, asContext(fake))).rejects.toMatchObject({
        statusCode: 401,
        code: 'UNAUTHORIZED',
      });

      expect(fake.clients.aiAssistantClient.getUserAssistants.post).toHaveBeenCalledTimes(0);
    });

    test('always sends a pagination object, with undefined fields when omitted', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.aiAssistantClient.getUserAssistants.post.mockImplementation(async () => edenOk([]));

      const result = await getUserAssistants(null as never, {} as never, asContext(fake));

      expect(fake.clients.aiAssistantClient.getUserAssistants.post).toHaveBeenCalledWith({
        userId: fakeUser.id,
        pagination: { limit: undefined, offset: undefined },
      });
      expect(result).toEqual([]);
    });

    test('maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.aiAssistantClient.getUserAssistants.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(getUserAssistants(null as never, {} as never, asContext(fake))).rejects.toMatchObject({
        statusCode: 502,
        code: 'BAD_GATEWAY',
      });
    });
  });

  describe('getMessage', () => {
    test('fetches the message, then its assistant for the ownership check, and returns the message', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.aiAssistantClient.getMessage.post.mockImplementation(async () =>
        edenOk({ ...MESSAGE, createdAt: 1700000000 }),
      );
      fake.clients.aiAssistantClient.getAssistant.post.mockImplementation(async () => edenOk(ASSISTANT));

      const result = await getMessage(null as never, { id: 'message-1' } as never, asContext(fake));

      expect(fake.clients.aiAssistantClient.getMessage.post).toHaveBeenCalledWith({ id: 'message-1' });
      // The assistant id is derived from the fetched message, not from the input.
      expect(fake.clients.aiAssistantClient.getAssistant.post).toHaveBeenCalledWith({ id: MESSAGE.assistantId });
      expect(result).toEqual(MESSAGE);
    });

    test('rejects an anonymous caller with 401 UNAUTHORIZED without calling the service', async () => {
      const fake = createFakeContext();

      await expect(getMessage(null as never, { id: 'message-1' } as never, asContext(fake))).rejects.toMatchObject({
        statusCode: 401,
        code: 'UNAUTHORIZED',
      });

      expect(fake.clients.aiAssistantClient.getMessage.post).toHaveBeenCalledTimes(0);
    });

    test('maps a failed message lookup to 502 BAD_GATEWAY before fetching the assistant', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.aiAssistantClient.getMessage.post.mockImplementation(async () =>
        edenError(404, 'NOT_FOUND', 'no message'),
      );

      await expect(getMessage(null as never, { id: 'message-1' } as never, asContext(fake))).rejects.toMatchObject({
        statusCode: 502,
        code: 'BAD_GATEWAY',
      });

      expect(fake.clients.aiAssistantClient.getAssistant.post).toHaveBeenCalledTimes(0);
    });

    test("rejects reading a message of another user's assistant with 403 FORBIDDEN", async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.aiAssistantClient.getMessage.post.mockImplementation(async () => edenOk(MESSAGE));
      fake.clients.aiAssistantClient.getAssistant.post.mockImplementation(async () => edenOk(FOREIGN_ASSISTANT));

      await expect(getMessage(null as never, { id: 'message-1' } as never, asContext(fake))).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
      });
    });
  });

  describe('getMessageHistory', () => {
    test('verifies assistant ownership, forwards pagination and returns every mapped message', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.aiAssistantClient.getAssistant.post.mockImplementation(async () => edenOk(ASSISTANT));
      const history = [
        { ...MESSAGE, createdAt: 1700000000 },
        { id: 'message-2', assistantId: 'assistant-1', text: 'Hi there', sender: 'assistant', createdAt: 1700000001 },
      ];
      fake.clients.aiAssistantClient.getMessageHistory.post.mockImplementation(async () => edenOk(history));

      const result = await getMessageHistory(
        null as never,
        { assistantId: 'assistant-1', pagination: { limit: 20, offset: 0 } } as never,
        asContext(fake),
      );

      expect(fake.clients.aiAssistantClient.getAssistant.post).toHaveBeenCalledWith({ id: 'assistant-1' });
      expect(fake.clients.aiAssistantClient.getMessageHistory.post).toHaveBeenCalledWith({
        assistantId: 'assistant-1',
        pagination: { limit: 20, offset: 0 },
      });
      expect(result).toEqual([
        MESSAGE,
        { id: 'message-2', assistantId: 'assistant-1', text: 'Hi there', sender: 'assistant' },
      ]);
    });

    test('rejects an anonymous caller with 401 UNAUTHORIZED without calling the service', async () => {
      const fake = createFakeContext();

      await expect(
        getMessageHistory(null as never, { assistantId: 'assistant-1' } as never, asContext(fake)),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

      expect(fake.clients.aiAssistantClient.getAssistant.post).toHaveBeenCalledTimes(0);
      expect(fake.clients.aiAssistantClient.getMessageHistory.post).toHaveBeenCalledTimes(0);
    });

    test("rejects reading another user's assistant history with 403 FORBIDDEN and does not fetch it", async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.aiAssistantClient.getAssistant.post.mockImplementation(async () => edenOk(FOREIGN_ASSISTANT));

      await expect(
        getMessageHistory(null as never, { assistantId: 'assistant-2' } as never, asContext(fake)),
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

      expect(fake.clients.aiAssistantClient.getMessageHistory.post).toHaveBeenCalledTimes(0);
    });

    test('maps a failed assistant lookup to 403 FORBIDDEN and does not fetch the history', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.aiAssistantClient.getAssistant.post.mockImplementation(async () =>
        edenError(404, 'NOT_FOUND', 'no assistant'),
      );

      await expect(
        getMessageHistory(null as never, { assistantId: 'assistant-1' } as never, asContext(fake)),
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

      expect(fake.clients.aiAssistantClient.getMessageHistory.post).toHaveBeenCalledTimes(0);
    });

    test('maps an upstream history failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.aiAssistantClient.getAssistant.post.mockImplementation(async () => edenOk(ASSISTANT));
      fake.clients.aiAssistantClient.getMessageHistory.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(
        getMessageHistory(null as never, { assistantId: 'assistant-1' } as never, asContext(fake)),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
    });
  });
});
