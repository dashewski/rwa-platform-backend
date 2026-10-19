/**
 * In-memory fake of PoolTransactionRepository for unit tests.
 *
 * The real repository talks to MongoDB and runs aggregateVolumeData as an
 * aggregation pipeline. Tests use this fake to keep the service layer
 * isolated: no database, no network, deterministic results. The public API
 * mirrors src/repositories/poolTransaction.repository.ts, and every method is
 * wrapped in bun:test mock() so interactions can be asserted.
 */
import { mock } from 'bun:test';
import { Types } from 'mongoose';
import type { PoolTransactionType } from '../../src/models/shared/enums.model';

export type FakePoolTransactionDoc = {
  _id: Types.ObjectId;
  poolAddress: string;
  transactionType: PoolTransactionType;
  userAddress: string;
  timestamp: number;
  rwaAmount: string;
  holdAmount: string;
  bonusAmount: string;
  holdFee: string;
  bonusFee: string;
  createdAt: number;
  updatedAt: number;
};

export type CreatePoolTransactionInput = Omit<
  FakePoolTransactionDoc,
  '_id' | 'createdAt' | 'updatedAt' | 'bonusAmount' | 'bonusFee'
> & {
  bonusAmount?: string;
  bonusFee?: string;
};

export type FakeVolumeBucket = {
  timestamp: number;
  mintVolume: string;
  burnVolume: string;
};

type SortSpec = Record<string, 'asc' | 'desc' | 1 | -1>;

function isDescending(direction: unknown): boolean {
  return direction === 'desc' || direction === -1;
}

function sortDocs<T extends Record<string, any>>(docs: T[], sort: SortSpec = {}): T[] {
  const [key, direction] = Object.entries(sort)[0] ?? [];
  if (!key) return docs;

  const sign = isDescending(direction) ? -1 : 1;
  return [...docs].sort((a, b) => (a[key] === b[key] ? 0 : a[key] > b[key] ? sign : -sign));
}

function matchesFilter(doc: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, value]) => {
    const docValue = doc[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Range operators, kept for symmetry with the real Mongo filters.
      const range = value as { $gte?: number; $lte?: number };
      if (range.$gte !== undefined && !(Number(docValue) >= range.$gte)) return false;
      if (range.$lte !== undefined && !(Number(docValue) <= range.$lte)) return false;
      return true;
    }
    return String(docValue) === String(value);
  });
}

export function createFakePoolTransactionRepository() {
  const store = new Map<string, FakePoolTransactionDoc>();

  const repository = {
    store,

    create: mock(async (data: CreatePoolTransactionInput) => {
      const now = Math.floor(Date.now() / 1000);
      const doc: FakePoolTransactionDoc = {
        _id: new Types.ObjectId(),
        poolAddress: data.poolAddress,
        transactionType: data.transactionType,
        userAddress: data.userAddress,
        timestamp: data.timestamp,
        rwaAmount: data.rwaAmount,
        holdAmount: data.holdAmount,
        bonusAmount: data.bonusAmount ?? '0', // schema default
        holdFee: data.holdFee,
        bonusFee: data.bonusFee ?? '0', // schema default
        createdAt: now,
        updatedAt: now,
      };
      store.set(doc._id.toString(), doc);
      return doc;
    }),

    findAll: mock(
      async (filter: Record<string, unknown> = {}, sort: SortSpec = { timestamp: 'desc' }, limit = 100, offset = 0) => {
        const matched = Array.from(store.values()).filter((doc) => matchesFilter(doc, filter));
        return sortDocs(matched, sort).slice(offset, offset + limit);
      },
    ),

    /**
     * Mirrors the bucket $group of the real pipeline: rwaAmount is summed per
     * transaction type inside every interval bucket (the real pipeline sums
     * $toDecimal values and returns strings through $toString).
     */
    aggregateVolumeData: mock(
      async (
        poolAddress: string,
        intervalSeconds: number,
        startTime: number,
        endTime: number,
        limit?: number,
      ): Promise<FakeVolumeBucket[]> => {
        const matched = Array.from(store.values()).filter((doc) =>
          matchesFilter(doc, { poolAddress, timestamp: { $gte: startTime, $lte: endTime } }),
        );

        const buckets = new Map<number, { mint: bigint; burn: bigint }>();
        for (const doc of matched) {
          const bucket = Math.floor(doc.timestamp / intervalSeconds) * intervalSeconds;
          const totals = buckets.get(bucket) ?? { mint: 0n, burn: 0n };
          if (doc.transactionType === 'MINT') totals.mint += BigInt(doc.rwaAmount);
          else totals.burn += BigInt(doc.rwaAmount);
          buckets.set(bucket, totals);
        }

        const result = Array.from(buckets.entries())
          .sort(([a], [b]) => a - b)
          .map(([timestamp, totals]) => ({
            timestamp,
            mintVolume: totals.mint.toString(),
            burnVolume: totals.burn.toString(),
          }));

        return limit && limit > 0 ? result.slice(0, limit) : result;
      },
    ),
  };

  return repository;
}

export type FakePoolTransactionRepository = ReturnType<typeof createFakePoolTransactionRepository>;
