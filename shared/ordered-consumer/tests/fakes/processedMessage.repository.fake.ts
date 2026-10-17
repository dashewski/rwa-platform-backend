/**
 * In-memory fake of ProcessedMessageRepository for unit tests: the marker set
 * without the Mongo transaction. runOnce marks the key only after the handler
 * succeeds, which matches the real rollback semantics.
 */
import { mock } from 'bun:test';

export function createFakeProcessedMessageRepository() {
  const keys = new Set<string>();

  return {
    keys,

    runOnce: mock(async (key: string, handler: () => Promise<void>) => {
      if (keys.has(key)) {
        return false;
      }

      await handler();
      keys.add(key);
      return true;
    }),
  };
}

export type FakeProcessedMessageRepository = ReturnType<typeof createFakeProcessedMessageRepository>;
