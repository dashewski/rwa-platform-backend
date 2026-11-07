import { mock } from 'bun:test';

export function createFakeFaucetCooldownRepository() {
  const store = new Map<string, number>();

  const repository = {
    store,

    findUnlockAt: mock(async (key: string) => store.get(key) ?? null),

    claim: mock(async (data: { key: string; now: number; unlockAt: number }) => {
      const current = store.get(data.key);

      if (current !== undefined && current > data.now) {
        return { claimed: false, unlockAt: current };
      }

      store.set(data.key, data.unlockAt);

      return { claimed: true, previousUnlockAt: current ?? null };
    }),

    release: mock(async (data: { key: string; previousUnlockAt: number | null }) => {
      if (data.previousUnlockAt === null) {
        store.delete(data.key);

        return;
      }

      store.set(data.key, data.previousUnlockAt);
    }),
  };

  return repository;
}

export type FakeFaucetCooldownRepository = ReturnType<typeof createFakeFaucetCooldownRepository>;
