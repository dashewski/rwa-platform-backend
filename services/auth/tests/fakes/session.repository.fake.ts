import { mock } from 'bun:test';
import type { Types } from 'mongoose';

export type FakeSessionDoc = {
  _id: string;
  userId: string;
  sessionKey: string;
  jti: string;
  expiresAt: number;
  ttlDate: Date;
  createdAt: number;
  updatedAt: number;
};

export function createFakeSessionRepository() {
  const store = new Map<string, FakeSessionDoc>();

  const now = () => Math.floor(Date.now() / 1000);

  const repository = {
    store,

    create: mock(async (userId: string, sessionKey: string, jti: string, expiresAt: number) => {
      if (store.has(sessionKey)) return null;

      const timestamp = now();
      const doc: FakeSessionDoc = {
        _id: `token-${sessionKey}`,
        userId,
        sessionKey,
        jti,
        expiresAt,
        ttlDate: new Date((expiresAt + 300) * 1000),
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      store.set(sessionKey, doc);

      return doc;
    }),

    findBySessionKey: mock(async (sessionKey: string) => {
      return store.get(sessionKey) ?? null;
    }),

    rotate: mock(async (sessionKey: string, jti: string, newJti: string, expiresAt: number) => {
      const doc = store.get(sessionKey);

      if (!doc || doc.jti !== jti || doc.expiresAt <= now()) return null;

      doc.jti = newJti;
      doc.expiresAt = expiresAt;
      doc.updatedAt = now();

      return { ...doc };
    }),

    deleteBySessionKey: mock(async (sessionKey: string) => {
      return store.delete(sessionKey) ? 1 : 0;
    }),

    deleteByUserId: mock(async (userId: string | Types.ObjectId) => {
      let deletedCount = 0;

      for (const [sessionKey, doc] of store) {
        if (doc.userId === userId.toString()) {
          store.delete(sessionKey);
          deletedCount += 1;
        }
      }

      return deletedCount;
    }),
  };

  return repository;
}

export type FakeSessionRepository = ReturnType<typeof createFakeSessionRepository>;
