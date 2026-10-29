import { mock } from 'bun:test';

export type FakeChallengeDoc = {
  nonce: string;
  wallet: string;
  expiresAt: number;
  ttlDate: Date;
  createdAt: number;
};

export function createFakeChallengeRepository() {
  const store = new Map<string, FakeChallengeDoc>();

  const now = () => Math.floor(Date.now() / 1000);

  const repository = {
    store,

    create: mock(async (data: { nonce: string; wallet: string; expiresAt: number }) => {
      const doc: FakeChallengeDoc = {
        ...data,
        ttlDate: new Date((data.expiresAt + 60) * 1000),
        createdAt: now(),
      };

      store.set(data.nonce, doc);

      return doc;
    }),

    consume: mock(async (nonce: string) => {
      const doc = store.get(nonce);

      if (!doc) return null;

      store.delete(nonce);

      return doc;
    }),
  };

  return repository;
}

export type FakeChallengeRepository = ReturnType<typeof createFakeChallengeRepository>;
