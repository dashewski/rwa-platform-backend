/**
 * Unit tests for MessageService.
 *
 * Scope: the service layer only. MessageRepository and AssistantRepository are
 * replaced with in-memory fakes (tests/fakes/*.fake.ts) and the OpenRouter client
 * with its fake; ContextService — a pure, in-process collaborator — is stubbed
 * with bun:test mock() so argument forwarding can be asserted directly. No
 * database, no broker and no network. Run with `bun test` from services/ai-assistant.
 */
import { beforeEach, describe, expect, test, mock } from 'bun:test';
import { AppError } from '@shared/errors/app-errors';
import type { OpenRouterClient } from '@shared/openrouter/client';
import { MessageService } from '../src/services/message.service';
import type { ContextService } from '../src/services/context.service';
import type { AssistantRepository } from '../src/repositories/assistant.repository';
import type { MessageRepository } from '../src/repositories/message.repository';
import type { AssistantContext } from '../src/models/shared/enums.model';
import { createFakeAssistantRepository, type FakeAssistantRepository } from './fakes/assistant.repository.fake';
import { createFakeMessageRepository, type FakeMessageRepository } from './fakes/message.repository.fake';
import { createFakeOpenRouterClient, type FakeOpenRouterClient } from './fakes/openrouter.client.fake';

const MODEL = 'openrouter/test-model';

const ASSISTANT: { userId: string; name: string; contextPreferences: AssistantContext } = {
  userId: 'user-1',
  name: 'Research Analyst',
  contextPreferences: ['investor_base'],
};

function createStubContextService(context = 'Assistant context') {
  return {
    getContextForAssistant: mock(async (_contextPreferences: AssistantContext, _userId: string) => context),
  };
}

type StubContextService = ReturnType<typeof createStubContextService>;

describe('MessageService (unit, fake repositories and clients)', () => {
  let messages: FakeMessageRepository;
  let assistants: FakeAssistantRepository;
  let context: StubContextService;
  let openRouter: FakeOpenRouterClient;
  let service: MessageService;

  beforeEach(() => {
    messages = createFakeMessageRepository();
    assistants = createFakeAssistantRepository();
    context = createStubContextService();
    openRouter = createFakeOpenRouterClient();
    service = new MessageService(
      messages as unknown as MessageRepository,
      assistants as unknown as AssistantRepository,
      context as unknown as ContextService,
      openRouter as unknown as OpenRouterClient,
      MODEL,
    );
  });

  test('createMessage: verifies the assistant, persists the user message and returns the user/assistant pair', async () => {
    const assistant = await assistants.create(ASSISTANT);
    const assistantId = assistant._id.toString();

    const result = await service.createMessage({ assistantId, text: 'What is HOLD?' });

    expect(assistants.findById).toHaveBeenCalledWith(assistantId);
    // The user message is persisted before the model call.
    expect(messages.create).toHaveBeenNthCalledWith(1, { assistantId, text: 'What is HOLD?', sender: 'user' });
    // Context is built for this assistant's preferences and user.
    expect(context.getContextForAssistant).toHaveBeenCalledWith(ASSISTANT.contextPreferences, ASSISTANT.userId);
    // The model call carries the configured model and middle-out compression.
    expect(openRouter.chatCompletion).toHaveBeenCalledTimes(1);
    const request = openRouter.chatCompletion.mock.calls[0][0];
    expect(request.model).toBe(MODEL);
    expect(request.transforms).toEqual(['middle-out']);
    expect(request.messages[0]).toEqual({
      role: 'system',
      content: `You are ${ASSISTANT.name}, an AI assistant.\n\nAssistant context`,
    });
    expect(request.messages[request.messages.length - 1]).toEqual({ role: 'user', content: 'What is HOLD?' });
    // The assistant reply is persisted from the first completion choice.
    expect(messages.create).toHaveBeenNthCalledWith(2, {
      assistantId,
      text: 'HOLD is the platform token.',
      sender: 'assistant',
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ assistantId, text: 'What is HOLD?', sender: 'user' });
    expect(result[1]).toMatchObject({ assistantId, text: 'HOLD is the platform token.', sender: 'assistant' });
    expect(typeof result[0].id).toBe('string');
    expect(result[0].id).toHaveLength(24); // Mongo ObjectId hex
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  test('createMessage: sends the recent history before the new user message', async () => {
    const assistant = await assistants.create(ASSISTANT);
    const assistantId = assistant._id.toString();
    await messages.create({ assistantId, text: 'First question', sender: 'user' });
    await messages.create({ assistantId, text: 'First answer', sender: 'assistant' });

    await service.createMessage({ assistantId, text: 'Follow-up' });

    // Last five messages, newest-first in the query.
    expect(messages.findByAssistantId).toHaveBeenCalledWith(assistantId, { createdAt: -1 }, 5);

    const request = openRouter.chatCompletion.mock.calls[0][0];
    expect(request.messages).toEqual([
      { role: 'system', content: `You are ${ASSISTANT.name}, an AI assistant.\n\nAssistant context` },
      // Pinned current behavior: the fake returns history in insertion order
      // (sorting is not implemented there, same convention as the faq fakes) and
      // the service calls `.reverse()`. With the real repository (sort
      // createdAt: -1, newest first) this reversal restores chronological order.
      // Also pinned: the user message persisted just above is part of the fetched
      // history AND is appended again as the final entry (it is saved before the
      // history query), so the user text appears twice in the prompt.
      { role: 'user', content: 'Follow-up' },
      { role: 'assistant', content: 'First answer' },
      { role: 'user', content: 'First question' },
      { role: 'user', content: 'Follow-up' },
    ]);
  });

  test('createMessage: uses the per-request model when provided', async () => {
    const assistant = await assistants.create(ASSISTANT);

    await service.createMessage({ assistantId: assistant._id.toString(), text: 'Hi', model: 'openrouter/other-model' });

    const request = openRouter.chatCompletion.mock.calls[0][0];
    expect(request.model).toBe('openrouter/other-model');
  });

  test('createMessage: propagates NOT_FOUND when the assistant does not exist and persists nothing', async () => {
    await expect(service.createMessage({ assistantId: 'unknown-id', text: 'Hi' })).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });

    expect(messages.create).toHaveBeenCalledTimes(0);
    expect(openRouter.chatCompletion).toHaveBeenCalledTimes(0);
  });

  test('createMessage: propagates an upstream failure and leaves the user message persisted', async () => {
    const assistant = await assistants.create(ASSISTANT);
    const assistantId = assistant._id.toString();
    openRouter.chatCompletion.mockImplementation(async () => {
      throw new AppError({
        message: 'OpenRouter Chat API error: 502 Bad Gateway',
        statusCode: 502,
        code: 'UPSTREAM_ERROR',
      });
    });

    await expect(service.createMessage({ assistantId, text: 'Hi' })).rejects.toMatchObject({
      statusCode: 502,
      code: 'UPSTREAM_ERROR',
    });

    // Current behavior: the user message is saved before the model call and is
    // not rolled back when the upstream call fails.
    expect(messages.create).toHaveBeenCalledTimes(1);
    expect(messages.create).toHaveBeenNthCalledWith(1, { assistantId, text: 'Hi', sender: 'user' });
    expect(messages.store.size).toBe(1); // only the user message exists
    // The history was fetched before the failing model call...
    expect(messages.findByAssistantId).toHaveBeenCalledTimes(1);
    // ...but the assistant reply was never persisted.
    expect(messages.create).not.toHaveBeenCalledWith(expect.objectContaining({ sender: 'assistant' }));
  });

  test('createMessage: propagates an unexpected client error unchanged', async () => {
    const assistant = await assistants.create(ASSISTANT);
    const assistantId = assistant._id.toString();
    openRouter.chatCompletion.mockImplementation(async () => {
      throw new Error('socket hang up');
    });

    await expect(service.createMessage({ assistantId, text: 'Hi' })).rejects.toThrow('socket hang up');
  });

  test('getMessageHistory: verifies the assistant, forwards pagination and maps every message', async () => {
    const assistant = await assistants.create(ASSISTANT);
    const assistantId = assistant._id.toString();
    await messages.create({ assistantId, text: 'A', sender: 'user' });
    await messages.create({ assistantId, text: 'B', sender: 'assistant' });
    await messages.create({ assistantId, text: 'C', sender: 'user' });
    const other = await assistants.create({ ...ASSISTANT, name: 'Other' });
    await messages.create({ assistantId: other._id.toString(), text: 'D', sender: 'user' });

    const result = await service.getMessageHistory(assistantId, 2, 1);

    expect(assistants.findById).toHaveBeenCalledWith(assistantId);
    expect(messages.findByAssistantId).toHaveBeenCalledWith(assistantId, { createdAt: -1 }, 2, 1);
    // Insertion order in the fake, sliced by offset/limit.
    expect(result.map((message) => message.text)).toEqual(['B', 'C']);
    for (const message of result) {
      expect(message.assistantId).toBe(assistantId);
      expect(message).not.toHaveProperty('_id');
    }
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  test('getMessageHistory: defaults to limit 100 / offset 0 and returns an empty array when there is no history', async () => {
    const assistant = await assistants.create(ASSISTANT);
    const assistantId = assistant._id.toString();

    const result = await service.getMessageHistory(assistantId);

    expect(messages.findByAssistantId).toHaveBeenCalledWith(assistantId, { createdAt: -1 }, 100, 0);
    expect(result).toEqual([]);
  });

  test('getMessageHistory: propagates NOT_FOUND for an unknown assistant', async () => {
    await expect(service.getMessageHistory('unknown-id')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });

    expect(messages.findByAssistantId).toHaveBeenCalledTimes(0);
  });

  test('getMessage: returns the mapped message', async () => {
    const assistant = await assistants.create(ASSISTANT);
    const created = await messages.create({
      assistantId: assistant._id.toString(),
      text: 'What is HOLD?',
      sender: 'user',
    });

    const message = await service.getMessage(created._id.toString());

    expect(message).toEqual({
      id: created._id.toString(),
      assistantId: created.assistantId,
      text: 'What is HOLD?',
      sender: 'user',
    });
  });

  test('getMessage: propagates NOT_FOUND for an unknown id', async () => {
    await expect(service.getMessage('unknown-id')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  test('updateMessage: forwards the text update and returns the mapped message', async () => {
    const assistant = await assistants.create(ASSISTANT);
    const created = await messages.create({ assistantId: assistant._id.toString(), text: 'Old', sender: 'assistant' });

    const updated = await service.updateMessage(created._id.toString(), { text: 'New' });

    expect(messages.update).toHaveBeenCalledWith(created._id.toString(), { text: 'New' });
    expect(updated).toEqual({
      id: created._id.toString(),
      assistantId: created.assistantId,
      text: 'New',
      sender: 'assistant',
    });
  });

  test('deleteMessage: deletes only the requested message and returns its id', async () => {
    const assistant = await assistants.create(ASSISTANT);
    const assistantId = assistant._id.toString();
    const first = await messages.create({ assistantId, text: 'First', sender: 'user' });
    const second = await messages.create({ assistantId, text: 'Second', sender: 'assistant' });

    const result = await service.deleteMessage(first._id.toString());

    expect(result).toBe(first._id.toString());
    expect(messages.store.has(first._id.toString())).toBe(false);
    expect(messages.store.has(second._id.toString())).toBe(true);
  });
});
