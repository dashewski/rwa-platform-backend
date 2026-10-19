/**
 * In-memory fake of CompanyRepository for unit tests.
 *
 * The real repository talks to MongoDB. Tests use this fake to keep the
 * service layer isolated: no database, no network, deterministic results.
 * The public API mirrors src/repositories/company.repository.ts, and every
 * method is wrapped in bun:test mock() so interactions can be asserted.
 */
import { mock } from 'bun:test';
import { Types } from 'mongoose';
import { AppError } from '@shared/errors/app-errors';

export type FakeCompanyDoc = {
  _id: Types.ObjectId;
  name: string;
  description: string;
  ownerId: string;
  country?: string;
  socials: { type: string; url: string }[];
  createdAt: number;
  updatedAt: number;
};

export type CreateCompanyInput = Pick<FakeCompanyDoc, 'name' | 'description' | 'ownerId'> &
  Partial<Pick<FakeCompanyDoc, 'country' | 'socials'>>;

function matchesFilter(doc: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  // Equality matching is enough for the filters used by tests ({ ownerId }, { companyId }, ...).
  return Object.entries(filter).every(([key, value]) => String(doc[key]) === String(value));
}

export function createFakeCompanyRepository() {
  const store = new Map<string, FakeCompanyDoc>();

  const notFound = (id: string) =>
    new AppError({ message: `Company ${id} not found`, statusCode: 404, code: 'NOT_FOUND' });

  const repository = {
    store,

    create: mock(async (data: CreateCompanyInput) => {
      const now = Math.floor(Date.now() / 1000);
      const doc: FakeCompanyDoc = {
        _id: new Types.ObjectId(),
        name: data.name,
        description: data.description,
        ownerId: data.ownerId,
        country: data.country, // mirrors the schema: country has no default
        socials: data.socials ?? [], // mirrors the schema default: []
        createdAt: now,
        updatedAt: now,
      };
      store.set(doc._id.toString(), doc);
      return doc;
    }),

    update: mock(
      async (id: string, data: Partial<Pick<FakeCompanyDoc, 'name' | 'description' | 'country' | 'socials'>>) => {
        const doc = store.get(id);
        if (!doc) throw notFound(id);

        const next: FakeCompanyDoc = { ...doc, ...data, updatedAt: Math.floor(Date.now() / 1000) };
        store.set(id, next);
        return next;
      },
    ),

    delete: mock(async (id: string) => {
      if (!store.has(id)) throw notFound(id);

      store.delete(id);
      return id;
    }),

    deleteMany: mock(async (filter: Record<string, unknown> = {}) => {
      let deletedCount = 0;

      for (const [key, doc] of store) {
        if (!matchesFilter(doc, filter)) continue;

        store.delete(key);
        deletedCount += 1;
      }

      return deletedCount;
    }),

    findById: mock(async (id: string) => {
      const doc = store.get(id);
      if (!doc) throw notFound(id);

      return doc;
    }),

    findAll: mock(
      async (
        filter: Record<string, unknown> = {},
        _sort: Record<string, 'asc' | 'desc'> = { createdAt: 'asc' },
        limit?: number,
        offset?: number,
      ) => {
        let result = Array.from(store.values()).filter((doc) => matchesFilter(doc, filter));

        // Mirrors the real repository: skip/limit are only applied when provided.
        if (typeof offset === 'number') result = result.slice(offset);
        if (typeof limit === 'number') result = result.slice(0, limit);

        return result;
      },
    ),
  };

  return repository;
}

export type FakeCompanyRepository = ReturnType<typeof createFakeCompanyRepository>;
