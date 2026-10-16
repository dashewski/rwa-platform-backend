import mongoose, { Schema, Types } from 'mongoose';
import type { InferRawDocType } from 'mongoose';

const poolSchemaDefinition = {
  ownerId: {
    type: String,
    required: true,
    trim: true,
  },
  ownerType: {
    type: String,
    required: true,
    trim: true,
  },
  ownerWallet: {
    type: String,
    trim: true,
  },
  chainId: {
    type: String,
    required: true,
    trim: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  businessId: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    default: '',
    trim: true,
  },
  tags: {
    type: [String],
    default: [],
  },
  riskScore: {
    type: Number,
    min: 1,
    max: 100,
  },
  image: {
    type: String,
    trim: true,
  },
  fileId: {
    type: String,
    trim: true,
  },

  // Contract Addresses
  rwaAddress: {
    type: String,
    required: true,
    trim: true,
  },
  poolAddress: {
    type: String,
    trim: true,
  },
  holdToken: {
    type: String,
    trim: true,
  },
  tokenId: {
    type: String,
    trim: true,
  },

  // Pool Configuration
  entryFeePercent: {
    type: String,
    trim: true,
  },
  exitFeePercent: {
    type: String,
    trim: true,
  },
  expectedHoldAmount: {
    type: String,
    trim: true,
  },
  expectedRwaAmount: {
    type: String,
    trim: true,
  },
  expectedBonusAmount: {
    type: String,
    trim: true,
  },
  rewardPercent: {
    type: String,
    trim: true,
  },
  priceImpactPercent: {
    type: String,
    trim: true,
  },
  liquidityCoefficient: {
    type: String,
    trim: true,
  },

  // Pool Flags
  awaitCompletionExpired: {
    type: Boolean,
    default: true,
  },
  floatingOutTranchesTimestamps: {
    type: Boolean,
    default: false,
  },
  fixedSell: {
    type: Boolean,
    default: true,
  },
  allowEntryBurn: {
    type: Boolean,
    default: false,
  },
  paused: {
    type: Boolean,
    required: true,
    default: false,
  },

  // Time Periods
  entryPeriodStart: {
    type: Number,
  },
  entryPeriodExpired: {
    type: Number,
  },
  completionPeriodExpired: {
    type: Number,
  },
  floatingTimestampOffset: {
    type: Number,
    default: 0,
  },
  fullReturnTimestamp: {
    type: Number,
  },

  // Pool State
  k: {
    type: String,
    trim: true,
  },
  realHoldReserve: {
    type: String,
    trim: true,
  },
  virtualHoldReserve: {
    type: String,
    trim: true,
  },
  virtualRwaReserve: {
    type: String,
    trim: true,
  },
  isTargetReached: {
    type: Boolean,
    default: false,
  },
  isFullyReturned: {
    type: Boolean,
    default: false,
  },

  // Amounts
  totalClaimedAmount: {
    type: String,
    trim: true,
  },
  totalReturnedAmount: {
    type: String,
    trim: true,
  },
  awaitingBonusAmount: {
    type: String,
    trim: true,
  },
  awaitingRwaAmount: {
    type: String,
    trim: true,
  },
  outgoingTranchesBalance: {
    type: String,
    trim: true,
  },
  rewardedRwaAmount: {
    type: String,
    trim: true,
    default: '0',
  },

  // Tranches
  outgoingTranches: {
    type: [
      {
        amount: {
          type: String,
          required: true,
          trim: true,
        },
        timestamp: {
          type: Number,
          required: true,
        },
        executedAmount: {
          type: String,
          required: true,
          trim: true,
          default: '0',
        },
      },
    ],
    default: [],
  },
  incomingTranches: {
    type: [
      {
        amount: {
          type: String,
          required: true,
          trim: true,
        },
        expiredAt: {
          type: Number,
          required: true,
        },
        returnedAmount: {
          type: String,
          required: true,
          trim: true,
          default: '0',
        },
      },
    ],
    default: [],
  },
  lastCompletedIncomingTranche: {
    type: Number,
    default: 0,
  },

  // Approval
  approvalSignaturesTaskId: {
    type: String,
  },
  approvalSignaturesTaskExpired: {
    type: Number,
  },

  // Evaluation
  riskScoreEvaluationProcess: {
    type: Boolean,
    default: false,
  },
  riskScoreEvaluationStartedAt: {
    type: Number,
    default: 0,
  },

  // Timestamps
  createdAt: {
    type: Number,
    default: () => Math.floor(Date.now() / 1000),
  },
  updatedAt: {
    type: Number,
    default: () => Math.floor(Date.now() / 1000),
  },
} as const;

const poolSchema = new Schema(poolSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

poolSchema.index({ businessId: 1 });
poolSchema.index({ rwaAddress: 1 });
poolSchema.index({ poolAddress: 1 });
poolSchema.index({ tokenId: 1 });
poolSchema.index({ isTargetReached: 1 });
poolSchema.index({ isFullyReturned: 1 });
poolSchema.index({ ownerId: 1 });
poolSchema.index({ chainId: 1 });
poolSchema.index({ tags: 1 });
poolSchema.index({ riskScore: 1 });

export type IPoolEntity = InferRawDocType<typeof poolSchemaDefinition> & { _id: Types.ObjectId };
export const PoolEntity = mongoose.model('Pool', poolSchema);
