/**
 * In-memory fake of EventRepository for unit tests.
 *
 * The real repository talks to MongoDB. Tests use this fake to keep the
 * scanner service and the scanner daemon isolated: no database, no network,
 * deterministic results. The public API mirrors
 * src/repositories/event.repository.ts, and every method is wrapped in
 * bun:test mock() so interactions can be asserted.
 */
import { mock } from 'bun:test';
import { Types } from 'mongoose';

export type FakeEventDoc = {
  _id: Types.ObjectId;
  chainId: number;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
  address: string;
  name: string;
  data: Record<string, any>;
  timestamp: number;
  createdAt: number;
  updatedAt: number;
};

export type CreateEventInput = Omit<FakeEventDoc, '_id' | 'createdAt' | 'updatedAt'>;

function matchesFilter(doc: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  // Equality matching is enough for the filters used by tests ({ chainId }, { name }, ...).
  return Object.entries(filter).every(([key, value]) => String(doc[key]) === String(value));
}

function compareValues(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

export function createFakeEventRepository() {
  const store = new Map<string, FakeEventDoc>();

  const repository = {
    store,

    findById: mock(async (id: string): Promise<FakeEventDoc | null> => {
      // The real repository resolves to null for an unknown id; the service
      // turns that into a 404 AppError.
      return store.get(id) ?? null;
    }),

    createEvents: mock(async (data: CreateEventInput[]): Promise<FakeEventDoc[]> => {
      if (data.length === 0) return [];

      const now = Math.floor(Date.now() / 1000);
      const docs: FakeEventDoc[] = [];

      for (const event of data) {
        // The real collection has a unique index on
        // (chainId, blockNumber, transactionHash, logIndex); insertMany with
        // ordered: true rejects the batch with E11000 on a duplicate.
        const duplicate = Array.from(store.values()).some(
          (doc) =>
            doc.chainId === event.chainId &&
            doc.blockNumber === event.blockNumber &&
            doc.transactionHash === event.transactionHash &&
            doc.logIndex === event.logIndex,
        );
        if (duplicate) {
          throw new Error(
            'E11000 duplicate key error collection: events index: chainId_1_blockNumber_1_transactionHash_1_logIndex_1',
          );
        }

        const doc: FakeEventDoc = { _id: new Types.ObjectId(), createdAt: now, updatedAt: now, ...event };
        store.set(doc._id.toString(), doc);
        docs.push(doc);
      }

      return docs;
    }),

    deleteBlockEvents: mock(async (chainId: number, blockNumber: number): Promise<number> => {
      let deletedCount = 0;
      for (const [id, doc] of store) {
        if (doc.chainId === chainId && doc.blockNumber === blockNumber) {
          store.delete(id);
          deletedCount += 1;
        }
      }
      return deletedCount;
    }),

    findAll: mock(
      async (
        filters: Record<string, unknown> = {},
        sort: Record<string, 'asc' | 'desc' | 1 | -1> = { blockNumber: -1, logIndex: -1 },
        limit = 100,
        offset = 0,
      ): Promise<FakeEventDoc[]> => {
        const sortKeys = Object.keys(sort);
        const docs = Array.from(store.values())
          .filter((doc) => matchesFilter(doc, filters))
          .sort((a, b) => {
            for (const key of sortKeys) {
              const direction = sort[key] === 'asc' || sort[key] === 1 ? 1 : -1;
              const diff = compareValues((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]);
              if (diff !== 0) return diff * direction;
            }
            return 0;
          });

        return docs.slice(offset, offset + limit);
      },
    ),
  };

  return repository;
}

export type FakeEventRepository = ReturnType<typeof createFakeEventRepository>;
