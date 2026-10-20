/**
 * In-memory fake of ScannerStateRepository for unit tests.
 *
 * The real repository talks to MongoDB. Tests use this fake to keep the
 * scanner service and the scanner daemon isolated: no database, no network,
 * deterministic results. The public API mirrors
 * src/repositories/scannerState.repository.ts, and every method is wrapped in
 * bun:test mock() so interactions can be asserted.
 */
import { mock } from 'bun:test';
import { Types } from 'mongoose';
import { AppError } from '@shared/errors/app-errors';

export type FakeScannerStateDoc = {
  _id: Types.ObjectId;
  chainId: string;
  lastScannedBlock: number;
  isActive: boolean;
  error?: string;
  createdAt: number;
  updatedAt: number;
};

export type CreateScannerStateInput = Pick<FakeScannerStateDoc, 'chainId' | 'lastScannedBlock'>;

function matchesFilter(doc: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  // Equality matching is enough for the filters used by tests ({ chainId }, ...).
  return Object.entries(filter).every(([key, value]) => String(doc[key]) === String(value));
}

export function createFakeScannerStateRepository() {
  const store = new Map<string, FakeScannerStateDoc>();

  const notFound = (chainId: string) =>
    new AppError({ message: `ScannerState ${chainId} not found`, statusCode: 404, code: 'NOT_FOUND' });

  const repository = {
    store,

    create: mock(async (data: CreateScannerStateInput): Promise<FakeScannerStateDoc> => {
      // The real collection has a unique index on chainId; create() on an
      // existing chainId rejects with E11000.
      if (store.has(data.chainId)) {
        throw new Error('E11000 duplicate key error collection: scannerstates index: chainId_1');
      }

      const now = Math.floor(Date.now() / 1000);
      const doc: FakeScannerStateDoc = {
        _id: new Types.ObjectId(),
        chainId: data.chainId,
        lastScannedBlock: data.lastScannedBlock,
        isActive: true, // schema default
        createdAt: now,
        updatedAt: now,
      };
      store.set(doc.chainId, doc);
      return doc;
    }),

    update: mock(async (chainId: string, data: { lastScannedBlock: number }): Promise<FakeScannerStateDoc> => {
      const doc = store.get(chainId);
      if (!doc) throw notFound(chainId);

      doc.lastScannedBlock = data.lastScannedBlock;
      doc.updatedAt = Math.floor(Date.now() / 1000);
      return doc;
    }),

    delete: mock(async (chainId: string): Promise<string> => {
      if (!store.has(chainId)) throw notFound(chainId);

      store.delete(chainId);
      return chainId;
    }),

    getLastScannedBlock: mock(async (chainId: string): Promise<number> => {
      return store.get(chainId)?.lastScannedBlock ?? 0;
    }),

    updateLastScannedBlock: mock(async (chainId: string, blockNumber: number): Promise<void> => {
      // Mirrors the real method: update when the chain already has a state
      // document, create it otherwise.
      const doc = store.get(chainId);
      if (doc) {
        doc.lastScannedBlock = blockNumber;
        doc.updatedAt = Math.floor(Date.now() / 1000);
      } else {
        await repository.create({ chainId, lastScannedBlock: blockNumber });
      }
    }),

    findAll: mock(
      async (
        filters: Record<string, unknown> = {},
        _sort: Record<string, 'asc' | 'desc' | 1 | -1> = { createdAt: 'asc' },
        limit = 100,
        offset = 0,
      ): Promise<FakeScannerStateDoc[]> => {
        return Array.from(store.values())
          .filter((doc) => matchesFilter(doc, filters))
          .slice(offset, offset + limit);
      },
    ),
  };

  return repository;
}

export type FakeScannerStateRepository = ReturnType<typeof createFakeScannerStateRepository>;
