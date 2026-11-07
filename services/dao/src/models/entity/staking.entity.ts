import mongoose, { Schema, Types } from 'mongoose';
import type { InferRawDocType } from 'mongoose';

const stakingSchemaDefinition = {
  staker: {
    type: String,
    required: true,
    trim: true,
  },
  /**
   * Staked amount, mirrored from the event's newVotingPower - exactly what the
   * contract returns from getVotingPower()/stakedAmount(). Rewards reinvest
   * into it, so it is NOT a sum of stake deltas. Kept under the historical
   * `amount` name: the stored VALUE is the absolute voting power.
   */
  amount: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
  },
  /** Timestamp until which the stake is voting-locked (DaoStaking_TokensLocked). */
  unlockTimestamp: {
    type: Number,
    default: 0,
  },
  lastStakeTimestamp: {
    type: Number,
    required: true,
  },

  chainId: {
    type: String,
    required: true,
    trim: true,
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

const stakingSchema = new Schema(stakingSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

// Indexes for efficient queries
stakingSchema.index({ staker: 1 });
stakingSchema.index({ chainId: 1 });
stakingSchema.index({ chainId: 1, staker: 1 }, { unique: true });
stakingSchema.index({ createdAt: -1 });

export type IStakingEntity = InferRawDocType<typeof stakingSchemaDefinition> & {
  _id: Types.ObjectId;
};

export const StakingEntity = mongoose.model('Staking', stakingSchema);
