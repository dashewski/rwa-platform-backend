/**
 * In-memory fake of PoolRepository for unit tests.
 *
 * The real repository talks to MongoDB. Tests use this fake to keep the
 * service layer isolated: no database, no network, deterministic results.
 * The public API mirrors src/repositories/pool.repository.ts, and every
 * method is wrapped in bun:test mock() so interactions can be asserted.
 */
import { mock } from 'bun:test';
import { Types } from 'mongoose';
import { AppError } from '@shared/errors/app-errors';

export type FakeOutgoingTranche = {
  amount: string;
  timestamp: number;
  executedAmount: string;
};

export type FakeIncomingTranche = {
  amount: string;
  expiredAt: number;
  returnedAmount: string;
};

export type FakePoolDoc = {
  _id: Types.ObjectId;
  ownerId: string;
  ownerType: string;
  ownerWallet?: string;
  chainId: string;
  name: string;
  businessId: string;
  description: string;
  tags: string[];
  riskScore?: number;
  image?: string;
  fileId?: string;
  rwaAddress: string;
  poolAddress?: string;
  holdToken?: string;
  tokenId?: string;
  entryFeePercent?: string;
  exitFeePercent?: string;
  expectedHoldAmount?: string;
  expectedRwaAmount?: string;
  expectedBonusAmount?: string;
  rewardPercent?: string;
  priceImpactPercent?: string;
  liquidityCoefficient?: string;
  awaitCompletionExpired: boolean;
  floatingOutTranchesTimestamps: boolean;
  fixedSell: boolean;
  allowEntryBurn: boolean;
  paused: boolean;
  entryPeriodStart?: number;
  entryPeriodExpired?: number;
  completionPeriodExpired?: number;
  floatingTimestampOffset: number;
  fullReturnTimestamp?: number;
  k?: string;
  realHoldReserve?: string;
  virtualHoldReserve?: string;
  virtualRwaReserve?: string;
  isTargetReached: boolean;
  isFullyReturned: boolean;
  totalClaimedAmount?: string;
  totalReturnedAmount?: string;
  awaitingBonusAmount?: string;
  awaitingRwaAmount?: string;
  outgoingTranchesBalance?: string;
  rewardedRwaAmount: string;
  outgoingTranches: FakeOutgoingTranche[];
  incomingTranches: FakeIncomingTranche[];
  lastCompletedIncomingTranche: number;
  approvalSignaturesTaskId?: string | null;
  approvalSignaturesTaskExpired?: number | null;
  riskScoreEvaluationProcess: boolean;
  riskScoreEvaluationStartedAt: number;
  createdAt: number;
  updatedAt: number;
};

export type CreatePoolInput = Omit<Partial<FakePoolDoc>, '_id' | 'createdAt' | 'updatedAt'> &
  Pick<FakePoolDoc, 'ownerId' | 'ownerType' | 'name' | 'chainId' | 'businessId' | 'rwaAddress'>;

export type UpdatePoolInput = Partial<
  Pick<
    FakePoolDoc,
    | 'chainId'
    | 'ownerWallet'
    | 'name'
    | 'poolAddress'
    | 'tokenId'
    | 'holdToken'
    | 'entryFeePercent'
    | 'exitFeePercent'
    | 'expectedHoldAmount'
    | 'expectedRwaAmount'
    | 'expectedBonusAmount'
    | 'rewardPercent'
    | 'entryPeriodStart'
    | 'entryPeriodExpired'
    | 'completionPeriodExpired'
    | 'awaitCompletionExpired'
    | 'floatingOutTranchesTimestamps'
    | 'fixedSell'
    | 'allowEntryBurn'
    | 'priceImpactPercent'
    | 'liquidityCoefficient'
    | 'k'
    | 'realHoldReserve'
    | 'virtualHoldReserve'
    | 'virtualRwaReserve'
    | 'floatingTimestampOffset'
    | 'isTargetReached'
    | 'isFullyReturned'
    | 'fullReturnTimestamp'
    | 'totalClaimedAmount'
    | 'totalReturnedAmount'
    | 'awaitingBonusAmount'
    | 'awaitingRwaAmount'
    | 'outgoingTranchesBalance'
    | 'outgoingTranches'
    | 'incomingTranches'
    | 'lastCompletedIncomingTranche'
    | 'paused'
    | 'description'
    | 'tags'
    | 'riskScore'
    | 'approvalSignaturesTaskId'
    | 'approvalSignaturesTaskExpired'
    | 'riskScoreEvaluationProcess'
    | 'riskScoreEvaluationStartedAt'
    | 'image'
    | 'fileId'
  >
>;

export type UpdatePoolByAddressInput = Partial<
  Pick<
    FakePoolDoc,
    | 'realHoldReserve'
    | 'virtualHoldReserve'
    | 'virtualRwaReserve'
    | 'awaitingRwaAmount'
    | 'awaitingBonusAmount'
    | 'isFullyReturned'
    | 'fullReturnTimestamp'
    | 'totalReturnedAmount'
    | 'lastCompletedIncomingTranche'
    | 'totalClaimedAmount'
    | 'outgoingTranchesBalance'
    | 'outgoingTranches'
    | 'incomingTranches'
    | 'paused'
    | 'isTargetReached'
    | 'floatingTimestampOffset'
    | 'rewardedRwaAmount'
  >
>;

function matchesFilter(doc: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  // Equality matching is enough for the filters used by tests ({ businessId }, ...).
  return Object.entries(filter).every(([key, value]) => String(doc[key]) === String(value));
}

export function createFakePoolRepository() {
  const store = new Map<string, FakePoolDoc>();

  const notFound = (id: string) =>
    new AppError({ message: `Pool ${id} not found`, statusCode: 404, code: 'NOT_FOUND' });

  const notFoundByAddress = (poolAddress: string) =>
    new AppError({ message: `Pool with address ${poolAddress} not found`, statusCode: 404, code: 'NOT_FOUND' });

  const repository = {
    store,

    createPool: mock(async (data: CreatePoolInput) => {
      const now = Math.floor(Date.now() / 1000);
      const doc: FakePoolDoc = {
        // Defaults mirror the mongoose schema defaults of PoolEntity.
        description: '',
        tags: [],
        awaitCompletionExpired: true,
        floatingOutTranchesTimestamps: false,
        fixedSell: true,
        allowEntryBurn: false,
        paused: false,
        floatingTimestampOffset: 0,
        isTargetReached: false,
        isFullyReturned: false,
        rewardedRwaAmount: '0',
        outgoingTranches: [],
        incomingTranches: [],
        lastCompletedIncomingTranche: 0,
        riskScoreEvaluationProcess: false,
        riskScoreEvaluationStartedAt: 0,
        ...data,
        _id: new Types.ObjectId(),
        createdAt: now,
        updatedAt: now,
      };
      store.set(doc._id.toString(), doc);
      return doc;
    }),

    updatePool: mock(async (id: string, data: UpdatePoolInput) => {
      const doc = store.get(id);
      if (!doc) throw notFound(id);

      const next: FakePoolDoc = { ...doc, ...data, updatedAt: Math.floor(Date.now() / 1000) };
      store.set(id, next);
      return next;
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
        limit = 100,
        offset = 0,
      ) => {
        return Array.from(store.values())
          .filter((doc) => matchesFilter(doc, filter))
          .slice(offset, offset + limit);
      },
    ),

    updatePoolByAddress: mock(async (poolAddress: string, data: UpdatePoolByAddressInput) => {
      const doc = Array.from(store.values()).find((candidate) => candidate.poolAddress === poolAddress);
      if (!doc) throw notFoundByAddress(poolAddress);

      const next: FakePoolDoc = { ...doc, ...data, updatedAt: Math.floor(Date.now() / 1000) };
      store.set(doc._id.toString(), next);
      return next;
    }),

    findByRwaAddressAndTokenId: mock(async (rwaAddress: string, tokenId: string) => {
      const doc = Array.from(store.values()).find(
        (candidate) => candidate.rwaAddress === rwaAddress && candidate.tokenId === tokenId,
      );
      if (!doc) {
        throw new AppError({
          message: `Pool with rwaAddress ${rwaAddress} and tokenId ${tokenId} not found`,
          statusCode: 404,
          code: 'NOT_FOUND',
        });
      }

      return doc;
    }),

    findByAddress: mock(async (poolAddress: string) => {
      const doc = Array.from(store.values()).find((candidate) => candidate.poolAddress === poolAddress);
      if (!doc) throw notFoundByAddress(poolAddress);

      return doc;
    }),
  };

  return repository;
}

export type FakePoolRepository = ReturnType<typeof createFakePoolRepository>;
