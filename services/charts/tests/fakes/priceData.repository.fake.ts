/**
 * In-memory fake of PriceDataRepository for unit tests.
 *
 * The real repository talks to MongoDB and runs aggregateOhlcData as an
 * aggregation pipeline. Tests use this fake to keep the service layer
 * isolated: no database, no network, deterministic results. The public API
 * mirrors src/repositories/priceData.repository.ts, and every method is
 * wrapped in bun:test mock() so interactions can be asserted.
 */
import { mock } from 'bun:test';
import { Types } from 'mongoose';

export type FakePriceDataDoc = {
  _id: Types.ObjectId;
  poolAddress: string;
  timestamp: number;
  blockNumber: number;
  realHoldReserve: string;
  virtualHoldReserve: string;
  virtualRwaReserve: string;
  price: string;
  createdAt: number;
  updatedAt: number;
};

export type CreatePriceDataInput = Omit<FakePriceDataDoc, '_id' | 'createdAt' | 'updatedAt'>;

export type FakeOhlcBar = {
  timestamp: number;
  open: string;
  high: string;
  low: string;
  close: string;
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
      // Range operators used by findByPoolAndTimeRange ({ timestamp: { $gte, $lte } }).
      const range = value as { $gte?: number; $lte?: number };
      if (range.$gte !== undefined && !(Number(docValue) >= range.$gte)) return false;
      if (range.$lte !== undefined && !(Number(docValue) <= range.$lte)) return false;
      return true;
    }
    return String(docValue) === String(value);
  });
}

export function createFakePriceDataRepository() {
  const store = new Map<string, FakePriceDataDoc>();

  const repository = {
    store,

    create: mock(async (data: CreatePriceDataInput) => {
      const now = Math.floor(Date.now() / 1000);
      const doc: FakePriceDataDoc = { _id: new Types.ObjectId(), createdAt: now, updatedAt: now, ...data };
      store.set(doc._id.toString(), doc);
      return doc;
    }),

    findAll: mock(
      async (filter: Record<string, unknown> = {}, sort: SortSpec = { timestamp: 'asc' }, limit = 100, offset = 0) => {
        const matched = Array.from(store.values()).filter((doc) => matchesFilter(doc, filter));
        return sortDocs(matched, sort).slice(offset, offset + limit);
      },
    ),

    findLatestByPoolAddress: mock(async (poolAddress: string) => {
      const matched = Array.from(store.values()).filter((doc) => doc.poolAddress === poolAddress);
      if (matched.length === 0) return null;
      // The real repository sorts by { timestamp: -1 } and takes the first entry.
      return matched.reduce((latest, doc) => (doc.timestamp > latest.timestamp ? doc : latest));
    }),

    findByPoolAndTimeRange: mock(
      async (
        poolAddress: string,
        startTime: number,
        endTime: number,
        sort: SortSpec = { timestamp: 'asc' },
        limit = 1000,
        offset = 0,
      ) => {
        // The real repository delegates to findAll with a { $gte, $lte } range filter.
        const matched = Array.from(store.values()).filter((doc) =>
          matchesFilter(doc, { poolAddress, timestamp: { $gte: startTime, $lte: endTime } }),
        );
        return sortDocs(matched, sort).slice(offset, offset + limit);
      },
    ),

    /**
     * Mirrors the $group/$project part of the real aggregation pipeline: rows
     * are bucketed by interval, open/close are the first/last price by
     * timestamp and high/low compare the price strings - MongoDB $max/$min on
     * strings compare lexicographically too, so fake and database agree.
     */
    aggregateOhlcData: mock(
      async (
        poolAddress: string,
        intervalSeconds: number,
        startTime: number,
        endTime: number,
        limit?: number,
      ): Promise<FakeOhlcBar[]> => {
        const matched = Array.from(store.values())
          .filter((doc) => matchesFilter(doc, { poolAddress, timestamp: { $gte: startTime, $lte: endTime } }))
          .sort((a, b) => a.timestamp - b.timestamp);

        const buckets = new Map<number, FakePriceDataDoc[]>();
        for (const doc of matched) {
          const bucket = Math.floor(doc.timestamp / intervalSeconds) * intervalSeconds;
          const entries = buckets.get(bucket) ?? [];
          entries.push(doc);
          buckets.set(bucket, entries);
        }

        const bars: FakeOhlcBar[] = Array.from(buckets.entries())
          .sort(([a], [b]) => a - b)
          .map(([timestamp, entries]) => ({
            timestamp,
            open: entries[0].price,
            high: entries.reduce((max, entry) => (entry.price > max ? entry.price : max), entries[0].price),
            low: entries.reduce((min, entry) => (entry.price < min ? entry.price : min), entries[0].price),
            close: entries[entries.length - 1].price,
          }));

        return limit && limit > 0 ? bars.slice(0, limit) : bars;
      },
    ),
  };

  return repository;
}

export type FakePriceDataRepository = ReturnType<typeof createFakePriceDataRepository>;
