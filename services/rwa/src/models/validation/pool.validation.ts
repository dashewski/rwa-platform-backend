import { t } from 'elysia';

export const poolSchema = t.Object({
  id: t.String(),
  ownerId: t.String(),
  ownerType: t.String(),
  ownerWallet: t.Optional(t.String()),
  name: t.String(),
  businessId: t.String(),
  description: t.String(),
  chainId: t.String(),
  tags: t.Array(t.String()),
  riskScore: t.Optional(t.Number()),
  image: t.Optional(t.String()),
  imageUrl: t.Optional(t.String()),
  fileId: t.Optional(t.String()),

  // Contract Addresses
  rwaAddress: t.String(),
  poolAddress: t.Optional(t.String()),
  holdToken: t.Optional(t.String()),
  tokenId: t.Optional(t.String()),

  // Pool Configuration
  entryFeePercent: t.Optional(t.String()),
  exitFeePercent: t.Optional(t.String()),
  expectedHoldAmount: t.Optional(t.String()),
  expectedRwaAmount: t.Optional(t.String()),
  expectedBonusAmount: t.Optional(t.String()),
  rewardPercent: t.Optional(t.String()),
  priceImpactPercent: t.Optional(t.String()),
  liquidityCoefficient: t.Optional(t.String()),

  // Pool Flags
  awaitCompletionExpired: t.Boolean(),
  floatingOutTranchesTimestamps: t.Boolean(),
  fixedSell: t.Boolean(),
  allowEntryBurn: t.Boolean(),
  paused: t.Boolean(),

  // Time Periods
  entryPeriodStart: t.Optional(t.Number()),
  entryPeriodExpired: t.Optional(t.Number()),
  completionPeriodExpired: t.Optional(t.Number()),
  floatingTimestampOffset: t.Number(),
  fullReturnTimestamp: t.Optional(t.Number()),

  // Pool State
  k: t.Optional(t.String()),
  realHoldReserve: t.Optional(t.String()),
  virtualHoldReserve: t.Optional(t.String()),
  virtualRwaReserve: t.Optional(t.String()),
  isTargetReached: t.Boolean(),
  isFullyReturned: t.Boolean(),

  // Amounts
  totalClaimedAmount: t.Optional(t.String()),
  totalReturnedAmount: t.Optional(t.String()),
  awaitingBonusAmount: t.Optional(t.String()),
  awaitingRwaAmount: t.Optional(t.String()),
  outgoingTranchesBalance: t.Optional(t.String()),
  rewardedRwaAmount: t.Optional(t.String()),

  // Tranches
  outgoingTranches: t.Array(
    t.Object({
      amount: t.String(),
      timestamp: t.Number(),
      executedAmount: t.String(),
    }),
  ),
  incomingTranches: t.Array(
    t.Object({
      amount: t.String(),
      expiredAt: t.Number(),
      returnedAmount: t.String(),
    }),
  ),
  lastCompletedIncomingTranche: t.Number(),

  // Approval
  approvalSignaturesTaskId: t.Optional(t.String()),
  approvalSignaturesTaskExpired: t.Optional(t.Number()),

  // Evaluation

  // Timestamps
  createdAt: t.Number(),
  updatedAt: t.Number(),
});

export type IPoolDTO = typeof poolSchema.static;
// TODO ADD IMAGE
export const createPoolRequest = t.Composite([
  t.Pick(poolSchema, ['ownerId', 'ownerType', 'name', 'businessId', 'chainId', 'rwaAddress']),
  t.Partial(
    t.Pick(poolSchema, [
      'entryFeePercent',
      'exitFeePercent',
      'expectedHoldAmount',
      'expectedRwaAmount',
      'rewardPercent',
      'entryPeriodStart',
      'entryPeriodExpired',
      'completionPeriodExpired',
      'awaitCompletionExpired',
      'floatingOutTranchesTimestamps',
      'fixedSell',
      'allowEntryBurn',
      'priceImpactPercent',
      'outgoingTranches',
      'incomingTranches',
      'description',
      'tags',
    ]),
  ),
]);
export const createPoolResponse = poolSchema;

/*
 * Create Pool with AI
 */
export const createPoolWithAIRequest = t.Object({
  description: t.String(),
  ownerId: t.String(),
  ownerType: t.String(),
  businessId: t.String(),
  chainId: t.String(),
  rwaAddress: t.String(),
});
export const createPoolWithAIResponse = poolSchema;

export const editPoolRequest = t.Object({
  id: t.String(),
  updateData: t.Partial(
    t.Pick(poolSchema, [
      'chainId',
      'name',
      'entryFeePercent',
      'exitFeePercent',
      'expectedHoldAmount',
      'expectedRwaAmount',
      'rewardPercent',
      'entryPeriodStart',
      'entryPeriodExpired',
      'completionPeriodExpired',
      'awaitCompletionExpired',
      'floatingOutTranchesTimestamps',
      'fixedSell',
      'allowEntryBurn',
      'priceImpactPercent',
      'outgoingTranches',
      'incomingTranches',
      'description',
      'tags',
    ]),
  ),
});
export const editPoolResponse = poolSchema;

export const requestPoolApprovalSignaturesRequest = t.Object({
  id: t.String(),
  ownerWallet: t.String(),
  deployerWallet: t.String(),
  createPoolFeeRatio: t.String(),
});

export const requestPoolApprovalSignaturesResponse = t.Object({
  taskId: t.String(),
});

export const rejectPoolApprovalSignaturesRequest = t.Pick(poolSchema, ['id']);
export const rejectPoolApprovalSignaturesResponse = t.Object({});

export const getPoolRequest = t.Pick(poolSchema, ['id']);
export const getPoolResponse = poolSchema;

export const getPoolsRequest = t.Object({
  filter: t.Optional(t.Record(t.String(), t.Any())),
  sort: t.Optional(t.Record(t.String(), t.Union([t.Literal('asc'), t.Literal('desc')]))),
  limit: t.Optional(t.Number()),
  offset: t.Optional(t.Number()),
});

export const getPoolsResponse = t.Array(poolSchema);

/*
 * Update Pool Image
 */
export const updatePoolImageRequest = t.Object({
  id: t.String(),
  image: t.String(),
  fileId: t.String(),
});
export const updatePoolImageResponse = poolSchema;
