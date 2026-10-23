/**
 * In-memory fake of TransactionRepository for unit tests.
 *
 * The real repository talks to MongoDB. Tests use this fake to keep the
 * service layer isolated: no database, no network, deterministic results.
 * The public API mirrors src/repositories/transaction.repository.ts, and every
 * method is wrapped in bun:test mock() so interactions can be asserted.
 *
 * Faithfulness notes:
 * - create() mimics model.create(data).toObject(): it stores the row under a
 *   fresh ObjectId and returns the plain document.
 * - findAll() shares the map's insertion order; the `sort` argument is accepted
 *   but not applied (ordering assertions belong on the repository mock's args).
 * - Mongo-only fields (`__v`) are not modelled; the service maps fields
 *   explicitly, so it never leaks them.
 */
import { mock } from 'bun:test';
import { Types } from 'mongoose';
import { AppError } from '@shared/errors/app-errors';

export type FakeTransactionDoc = {
  _id: Types.ObjectId;
  from: string;
  to: string;
  tokenAddress: string;
  tokenId: string;
  poolAddress: string;
  chainId: string;
  transactionHash: string;
  logIndex: number;
  blockNumber: number;
  amount: number;
  createdAt: number;
  updatedAt: number;
};

export type CreateTransactionInput = Pick<
  FakeTransactionDoc,
  | 'from'
  | 'to'
  | 'tokenAddress'
  | 'tokenId'
  | 'poolAddress'
  | 'chainId'
  | 'transactionHash'
  | 'logIndex'
  | 'blockNumber'
  | 'amount'
>;

function matchesFilter(doc: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  // Equality matching is enough for the filters used by tests ({ from }, { to }, ...).
  return Object.entries(filter).every(([key, value]) => String(doc[key]) === String(value));
}

export function createFakeTransactionRepository() {
  const store = new Map<string, FakeTransactionDoc>();

  const notFound = (id: string) =>
    new AppError({ message: `Transaction ${id} not found`, statusCode: 404, code: 'NOT_FOUND' });

  const repository = {
    store,

    create: mock(async (data: CreateTransactionInput) => {
      const now = Math.floor(Date.now() / 1000);
      const doc: FakeTransactionDoc = { _id: new Types.ObjectId(), createdAt: now, updatedAt: now, ...data };
      store.set(doc._id.toString(), doc);
      return doc;
    }),

    findById: mock(async (id: string) => {
      const doc = store.get(id);
      if (!doc) throw notFound(id);

      return doc;
    }),

    findAll: mock(
      async (
        filter: Record<string, unknown> = {},
        _sort: Record<string, 'asc' | 'desc'> = { blockNumber: 'asc' },
        limit = 100,
        offset = 0,
      ) => {
        return Array.from(store.values())
          .filter((doc) => matchesFilter(doc, filter))
          .slice(offset, offset + limit);
      },
    ),
  };

  return repository;
}

export type FakeTransactionRepository = ReturnType<typeof createFakeTransactionRepository>;
