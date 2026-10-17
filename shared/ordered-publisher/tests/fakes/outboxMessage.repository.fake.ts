/**
 * In-memory fake of OutboxMessageRepository for unit tests: the same claim /
 * mark contract without a Mongo connection.
 */
import { mock } from 'bun:test';

export function createFakeOutboxMessageRepository() {
  const messages: Array<Record<string, any>> = [];

  return {
    messages,

    create: mock(async (data: Record<string, any>) => {
      const doc = { _id: `outbox-${messages.length + 1}`, status: 'pending', ...data };
      messages.push(doc);
      return doc;
    }),

    claimNext: mock(async () => {
      const doc = messages.find((candidate) => candidate.status === 'pending');
      if (!doc) return null;
      doc.status = 'sending';
      return { ...doc };
    }),

    markSent: mock(async (id: string) => {
      const doc = messages.find((candidate) => candidate._id === id);
      if (doc) doc.status = 'sent';
    }),

    release: mock(async (id: string) => {
      const doc = messages.find((candidate) => candidate._id === id);
      if (doc) doc.status = 'pending';
    }),

    releaseSending: mock(async () => {
      for (const doc of messages) {
        if (doc.status === 'sending') doc.status = 'pending';
      }
    }),
  };
}

export type FakeOutboxMessageRepository = ReturnType<typeof createFakeOutboxMessageRepository>;
