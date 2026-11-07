import mongoose, { Schema, Types, type InferRawDocType } from 'mongoose';

const feesSchemaDefinition = {
  userWallet: {
    type: String,
    required: true,
    trim: true,
  },
  userId: {
    type: String,
    required: true,
    trim: true,
  },
  chainId: {
    type: String,
    required: true,
    trim: true,
  },
  tokenAddress: {
    type: String,
    required: true,
    trim: true,
  },

  // Commission amounts for different operations (using Decimal128 for BigNumber support)
  buyCommissionAmount: {
    type: mongoose.Schema.Types.Decimal128,
    default: 0,
  },
  sellCommissionAmount: {
    type: mongoose.Schema.Types.Decimal128,
    default: 0,
  },
  tokenCreationCommissionAmount: {
    type: mongoose.Schema.Types.Decimal128,
    default: 0,
  },
  poolCreationCommissionAmount: {
    type: mongoose.Schema.Types.Decimal128,
    default: 0,
  },

  // Referral rewards for this specific token
  referralRewardAmount: {
    type: mongoose.Schema.Types.Decimal128,
    default: 0,
  },

  // Commission counts for statistics
  buyCommissionCount: {
    type: Number,
    default: 0,
  },
  sellCommissionCount: {
    type: Number,
    default: 0,
  },
  tokenCreationCommissionCount: {
    type: Number,
    default: 0,
  },
  poolCreationCommissionCount: {
    type: Number,
    default: 0,
  },

  // Referral counts for statistics
  referralRewardCount: {
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

const feesSchema = new Schema(feesSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

// Indexes for efficient queries
feesSchema.index({ userWallet: 1 });
feesSchema.index({ userId: 1 });
feesSchema.index({ chainId: 1 });
feesSchema.index({ tokenAddress: 1 });
feesSchema.index({ userWallet: 1, chainId: 1, tokenAddress: 1 }, { unique: true });
feesSchema.index({ createdAt: -1 });
feesSchema.index({ referralRewardAmount: -1 });

export type IFeesEntity = InferRawDocType<typeof feesSchemaDefinition> & { _id: Types.ObjectId };

export const FeesEntity = mongoose.model('Fees', feesSchema);
