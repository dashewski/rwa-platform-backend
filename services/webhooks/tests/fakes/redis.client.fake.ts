/**
 * In-memory fake of the Redis client (RedisWithTracing extends ioredis).
 *
 * Mirrors only the surface the webhooks services use: string commands
 * (get/set/del/incr/expire), set commands (sadd/srem/smembers), the `status`
 * flag that gates the cache paths, and quit(). Everything stays in memory —
 * no server, no sockets. Every method is wrapped in bun:test mock() so
 * interactions can be asserted.
 */
import { mock } from 'bun:test';

type StringEntry = { value: string; expiresAt: number | null };

export function createFakeRedisClient() {
  const strings = new Map<string, StringEntry>();
  const sets = new Map<string, Set<string>>();

  const redis = {
    // ioredis exposes `status` ('ready', 'connecting', ...); both services gate
    // their cache reads on it, so tests can flip it per scenario.
    status: 'ready',

    get: mock(async (key: string) => {
      const entry = strings.get(key);
      if (!entry) return null;

      if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
        strings.delete(key);
        return null;
      }

      return entry.value;
    }),

    set: mock(async (key: string, value: string, expiryMode?: string, ttlSeconds?: number) => {
      // Only the ('EX', seconds) form used by the services is modelled.
      const expiresAt = expiryMode === 'EX' && typeof ttlSeconds === 'number' ? Date.now() + ttlSeconds * 1000 : null;
      strings.set(key, { value, expiresAt });
      return 'OK';
    }),

    del: mock(async (key: string) => {
      return strings.delete(key) ? 1 : 0;
    }),

    incr: mock(async (key: string) => {
      const entry = strings.get(key);
      const next = (entry ? Number(entry.value) : 0) + 1;
      strings.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? null });
      return next;
    }),

    expire: mock(async (key: string, seconds: number) => {
      const entry = strings.get(key);
      if (!entry) return 0;

      entry.expiresAt = Date.now() + seconds * 1000;
      return 1;
    }),

    sadd: mock(async (key: string, member: string) => {
      const set = sets.get(key) ?? new Set<string>();
      const previousSize = set.size;
      set.add(member);
      sets.set(key, set);
      return set.size - previousSize;
    }),

    srem: mock(async (key: string, member: string) => {
      const set = sets.get(key);
      if (!set) return 0;

      return set.delete(member) ? 1 : 0;
    }),

    smembers: mock(async (key: string) => Array.from(sets.get(key) ?? [])),

    quit: mock(async () => 'OK'),

    // Test-only handles for seeding and inspecting cache state (the pilot fakes
    // expose their store the same way).
    strings,
    sets,
  };

  return redis;
}

export type FakeRedisClient = ReturnType<typeof createFakeRedisClient>;
