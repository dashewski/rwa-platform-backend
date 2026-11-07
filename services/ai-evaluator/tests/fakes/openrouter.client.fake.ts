/**
 * In-memory fake of OpenRouterClient for unit tests.
 *
 * The real client performs HTTP calls to OpenRouter. Tests use this fake to keep
 * the service layer isolated: no network, no API key, deterministic completions.
 * It mirrors the chatCompletion() method used by
 * src/services/evaluation.service.ts, and the mock is wrapped in bun:test
 * mock() so the request payloads (model, messages) can be asserted.
 *
 * Responses are queued raw: the service parses the assistant content as JSON, so
 * tests either queueResponse() a raw string or queueJsonResponse() a value.
 */
import { mock } from 'bun:test';

export type FakeChatCompletionRequest = {
  model: string;
  messages: Array<{ role: string; content: unknown }>;
};

const DEFAULT_RESPONSE = JSON.stringify({ riskScore: 50, reasoning: 'Default reasoning', factors: [] });

export function createFakeOpenRouterClient() {
  const queuedResponses: string[] = [];
  let fallbackResponse = DEFAULT_RESPONSE;
  let completionCounter = 0;

  const chatCompletion = mock(async (_request: FakeChatCompletionRequest) => {
    completionCounter++;
    const content = queuedResponses.shift() ?? fallbackResponse;

    return {
      id: `chatcmpl-${completionCounter}`,
      choices: [{ message: { role: 'assistant', content }, index: 0, finishReason: 'stop' }],
    };
  });

  return {
    chatCompletion,

    /** Queues the raw content of the next completion; queued responses are consumed first, in FIFO order. */
    queueResponse(content: string) {
      queuedResponses.push(content);
    },

    /** Queues the next completion as a JSON string, the shape the service expects from the LLM. */
    queueJsonResponse(value: unknown) {
      queuedResponses.push(JSON.stringify(value));
    },

    /** Replaces the content used once the queue is empty. */
    setDefaultResponse(content: string) {
      fallbackResponse = content;
    },

    setDefaultJsonResponse(value: unknown) {
      fallbackResponse = JSON.stringify(value);
    },
  };
}

export type FakeOpenRouterClient = ReturnType<typeof createFakeOpenRouterClient>;
