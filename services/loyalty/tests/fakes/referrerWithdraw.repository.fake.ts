/**
 * In-memory fake of ReferrerWithdrawRepository for unit tests.
 *
 * The real repository talks to MongoDB and upserts one document per
 * (referrerWallet, referrerId, chainId, tokenAddress) key. This fake
 * reproduces that document shape in memory, including the amount
 * normalization (string -> Decimal128) and the $inc of addWithdrawnAmount.
 * The public API mirrors src/repositories/referrerWithdraw.repository.ts, and
 * every method is wrapped in bun:test mock() so interactions can be asserted.
 */
import { mock } from 'bun:test';
import { Types } from 'mongoose';

export type FakeReferrerWithdrawDoc = {
  _id: Types.ObjectId;
  referrerWallet: string;
  referrerId: string;
  chainId: string;
  tokenAddress: string;
  totalWithdrawnAmount: Types.Decimal128;
  taskId?: string;
  taskExpiredAt?: number;
  taskCooldown?: number;
  createdAt: number;
  updatedAt: number;
};

export type CreateOrUpdateWithdrawInput = Pick<
  FakeReferrerWithdrawDoc,
  'referrerWallet' | 'referrerId' | 'chainId' | 'tokenAddress' | 'taskId' | 'taskExpiredAt' | 'taskCooldown'
> & {
  totalWithdrawnAmount: string | Types.Decimal128;
};

export type SeedReferrerWithdrawInput = {
  referrerWallet: string;
  referrerId: string;
  chainId: string;
  tokenAddress: string;
  totalWithdrawnAmount?: string;
  taskId?: string;
  taskExpiredAt?: number;
  taskCooldown?: number;
  createdAt?: number;
  updatedAt?: number;
};

/** Adds two decimal strings; integers (the event values) stay exact via BigInt. */
function addDecimal(current: Types.Decimal128, amount: string): Types.Decimal128 {
  const base = current.toString();
  const sum =
    /^-?\d+$/.test(base) && /^-?\d+$/.test(amount) ? BigInt(base) + BigInt(amount) : Number(base) + Number(amount);
  return Types.Decimal128.fromString(String(sum));
}

function matchesFilter(doc: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  // Equality matching is enough for the filters used by tests ({ referrerWallet }, { chainId }, ...).
  return Object.entries(filter).every(([key, value]) => String(doc[key]) === String(value));
}

export function createFakeReferrerWithdrawRepository() {
  const store = new Map<string, FakeReferrerWithdrawDoc>();

  const insert = (input: SeedReferrerWithdrawInput): FakeReferrerWithdrawDoc => {
    const now = Math.floor(Date.now() / 1000);
    const doc: FakeReferrerWithdrawDoc = {
      _id: new Types.ObjectId(),
      referrerWallet: input.referrerWallet,
      referrerId: input.referrerId,
      chainId: input.chainId,
      tokenAddress: input.tokenAddress,
      totalWithdrawnAmount: Types.Decimal128.fromString(input.totalWithdrawnAmount ?? '0'),
      taskId: input.taskId,
      taskExpiredAt: input.taskExpiredAt,
      taskCooldown: input.taskCooldown,
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? now,
    };
    store.set(doc._id.toString(), doc);
    return doc;
  };

  const findByKey = (
    referrerWallet: string,
    referrerId: string,
    chainId: string,
    tokenAddress: string,
  ): FakeReferrerWithdrawDoc | null => {
    for (const doc of store.values()) {
      if (
        doc.referrerWallet === referrerWallet &&
        doc.referrerId === referrerId &&
        doc.chainId === chainId &&
        doc.tokenAddress === tokenAddress
      ) {
        return doc;
      }
    }
    return null;
  };

  const repository = {
    store,

    /** Insert a document directly, bypassing the mocks (interaction counts stay untouched). */
    seed: (input: SeedReferrerWithdrawInput): FakeReferrerWithdrawDoc => insert(input),

    createOrUpdate: mock(async (data: CreateOrUpdateWithdrawInput) => {
      const doc =
        findByKey(data.referrerWallet, data.referrerId, data.chainId, data.tokenAddress) ??
        insert({ ...data, totalWithdrawnAmount: '0' });

      doc.totalWithdrawnAmount =
        typeof data.totalWithdrawnAmount === 'string'
          ? Types.Decimal128.fromString(data.totalWithdrawnAmount)
          : data.totalWithdrawnAmount;
      if (data.taskId !== undefined) doc.taskId = data.taskId;
      if (data.taskExpiredAt !== undefined) doc.taskExpiredAt = data.taskExpiredAt;
      if (data.taskCooldown !== undefined) doc.taskCooldown = data.taskCooldown;
      doc.updatedAt = Math.floor(Date.now() / 1000);

      store.set(doc._id.toString(), doc);
      return doc;
    }),

    addWithdrawnAmount: mock(
      async (referrerWallet: string, referrerId: string, chainId: string, tokenAddress: string, amount: string) => {
        const doc =
          findByKey(referrerWallet, referrerId, chainId, tokenAddress) ??
          insert({ referrerWallet, referrerId, chainId, tokenAddress });

        doc.totalWithdrawnAmount = addDecimal(doc.totalWithdrawnAmount, amount);
        doc.updatedAt = Math.floor(Date.now() / 1000);

        store.set(doc._id.toString(), doc);
        return doc;
      },
    ),

    findByReferrerAndToken: mock(
      async (referrerWallet: string, referrerId: string, chainId: string, tokenAddress: string) =>
        findByKey(referrerWallet, referrerId, chainId, tokenAddress),
    ),

    findAll: mock(
      async (
        filter: Record<string, unknown> = {},
        _sort: Record<string, 'asc' | 'desc'> = { createdAt: 'desc' },
        limit = 100,
        offset = 0,
      ) => {
        return Array.from(store.values())
          .filter((doc) => matchesFilter(doc as unknown as Record<string, unknown>, filter))
          .slice(offset, offset + limit);
      },
    ),
  };

  return repository;
}

export type FakeReferrerWithdrawRepository = ReturnType<typeof createFakeReferrerWithdrawRepository>;
