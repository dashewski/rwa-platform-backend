import mongoose, { Schema, Types } from 'mongoose';
import type { InferRawDocType } from 'mongoose';
import { StakingOperationList } from '../shared/enums.model';

const stakingHistorySchemaDefinition = {
  staker: {
    type: String,
    required: true,
    trim: true,
  },
  amount: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
  },
  /** Rewards received with an unstake (TokensUnstaked.rewardsReceived); 0 for stakes. */
  rewards: {
    type: mongoose.Schema.Types.Decimal128,
    default: () => mongoose.Types.Decimal128.fromString('0'),
  },
  operation: {
    type: String,
    required: true,
    enum: StakingOperationList,
  },

  // Blockchain metadata
  chainId: {
    type: String,
    required: true,
    trim: true,
  },
  transactionHash: {
    type: String,
    required: true,
    trim: true,
  },
  logIndex: {
    type: Number,
    required: true,
  },
  blockNumber: {
    type: Number,
    required: true,
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
};

const stakingHistorySchema = new Schema(stakingHistorySchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

// Indexes for efficient queries
stakingHistorySchema.index({ staker: 1 });
stakingHistorySchema.index({ chainId: 1 });
stakingHistorySchema.index({ operation: 1 });
stakingHistorySchema.index({ chainId: 1, staker: 1 });
stakingHistorySchema.index({ transactionHash: 1, logIndex: 1 }, { unique: true });
stakingHistorySchema.index({ createdAt: -1 });

export type IStakingHistoryEntity = InferRawDocType<typeof stakingHistorySchemaDefinition> & {
  _id: Types.ObjectId;
};

export const StakingHistoryEntity = mongoose.model('StakingHistory', stakingHistorySchema);
