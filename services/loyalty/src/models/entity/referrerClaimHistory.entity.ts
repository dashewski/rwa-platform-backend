import mongoose, { Schema, Types, type InferRawDocType } from 'mongoose';

const referrerClaimHistorySchemaDefinition = {
  referrerWallet: {
    type: String,
    required: true,
    trim: true,
  },
  referrerId: {
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
  referralWallet: {
    type: String,
    required: true,
    trim: true,
  },

  // Withdrawal details
  amount: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
  },

  // Blockchain event data
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
} as const;

const referrerClaimHistorySchema = new Schema(referrerClaimHistorySchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

// Indexes for efficient queries
referrerClaimHistorySchema.index({ referrerWallet: 1 });
referrerClaimHistorySchema.index({ referrerId: 1 });
referrerClaimHistorySchema.index({ referralWallet: 1 });
referrerClaimHistorySchema.index({ chainId: 1 });
referrerClaimHistorySchema.index({ tokenAddress: 1 });
referrerClaimHistorySchema.index({ transactionHash: 1, logIndex: 1, chainId: 1 }, { unique: true });
referrerClaimHistorySchema.index({ blockNumber: -1 });
referrerClaimHistorySchema.index({ timestamp: -1 });
referrerClaimHistorySchema.index({ createdAt: -1 });
referrerClaimHistorySchema.index({ referrerWallet: 1, chainId: 1, tokenAddress: 1 });

export type IReferrerClaimHistoryEntity = InferRawDocType<typeof referrerClaimHistorySchemaDefinition> & {
  _id: Types.ObjectId;
};

export const ReferrerClaimHistoryEntity = mongoose.model('ReferrerClaimHistory', referrerClaimHistorySchema);
