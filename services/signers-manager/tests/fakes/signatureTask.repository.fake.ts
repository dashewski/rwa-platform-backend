/**
 * In-memory fake of SignatureTaskRepository for unit tests.
 *
 * The real repository talks to MongoDB. Tests use this fake to keep the
 * service layer isolated: no database, no network, deterministic results.
 * The public API mirrors src/repositories/signatureTask.repository.ts, and
 * every method is wrapped in bun:test mock() so interactions can be asserted.
 */
import { mock } from 'bun:test';
import { Types } from 'mongoose';
import { AppError } from '@shared/errors/app-errors';

export type FakeSignatureTaskDoc = {
  _id: Types.ObjectId;
  ownerId: string;
  ownerType: string;
  hash: string;
  requiredSignatures: number;
  expired: number;
  createdAt: number;
  updatedAt: number;
};

export type CreateSignatureTaskInput = Pick<
  FakeSignatureTaskDoc,
  'ownerId' | 'ownerType' | 'hash' | 'requiredSignatures' | 'expired'
>;

function matchesFilter(doc: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  // Equality matching is enough for the filters used by tests ({ ownerId }, { hash }, ...).
  return Object.entries(filter).every(([key, value]) => String(doc[key]) === String(value));
}

export function createFakeSignatureTaskRepository() {
  const store = new Map<string, FakeSignatureTaskDoc>();

  const notFound = (id: string) =>
    new AppError({ message: `SignatureTask ${id} not found`, statusCode: 404, code: 'NOT_FOUND' });

  const repository = {
    store,

    create: mock(async (data: CreateSignatureTaskInput) => {
      const now = Math.floor(Date.now() / 1000);
      const doc: FakeSignatureTaskDoc = {
        _id: new Types.ObjectId(),
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      store.set(doc._id.toString(), doc);
      return doc;
    }),

    update: mock(async (id: string, data: Partial<{ completed: boolean }>) => {
      const doc = store.get(id);
      if (!doc) throw notFound(id);

      const next: FakeSignatureTaskDoc = { ...doc, ...data, updatedAt: Math.floor(Date.now() / 1000) };
      store.set(id, next);
      return next;
    }),

    findById: mock(async (id: string) => {
      const doc = store.get(id);
      if (!doc) throw notFound(id);

      return doc;
    }),

    findByHash: mock(async (hash: string) => {
      const doc = Array.from(store.values()).find((candidate) => candidate.hash === hash);
      if (!doc) {
        throw new AppError({
          message: `SignatureTask with hash ${hash} not found`,
          statusCode: 404,
          code: 'NOT_FOUND',
        });
      }

      return doc;
    }),

    findAll: mock(
      async (
        filter: Record<string, unknown> = {},
        _sort: Record<string, 'asc' | 'desc'> = { createdAt: 'asc' },
        limit = 100,
        offset = 0,
      ) => {
        return Array.from(store.values())
          .filter((doc) => matchesFilter(doc, filter))
          .slice(offset, offset + limit);
      },
    ),

    findActive: mock(async () => {
      // Mirrors the real `$or: [{ expired: { $gt: now } }, { expired: { $exists: false } }]`.
      // The fake always sets `expired` (the schema marks it required), so the
      // `$exists: false` branch of the real query can never match here.
      const now = Math.floor(Date.now() / 1000);
      return Array.from(store.values()).filter((doc) => doc.expired > now);
    }),
  };

  return repository;
}

export type FakeSignatureTaskRepository = ReturnType<typeof createFakeSignatureTaskRepository>;
