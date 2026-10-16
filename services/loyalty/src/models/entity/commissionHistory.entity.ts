import mongoose, { Schema, Types, type InferRawDocType } from 'mongoose';

const commissionHistorySchemaDefinition = {
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

  amount: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
  },

  actionType: {
    type: String,
    required: true,
    trim: true,
  },

  transactionHash: {
    type: String,
    required: true,
    trim: true,
  },

  relatedUserWallet: {
    type: String,
    trim: true,
  },
  relatedUserId: {
    type: String,
    trim: true,
  },

  createdAt: {
    type: Number,
    default: () => Math.floor(Date.now() / 1000),
  },
  updatedAt: {
    type: Number,
    default: () => Math.floor(Date.now() / 1000),
  },
} as const;

const commissionHistorySchema = new Schema(commissionHistorySchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

// Indexes for efficient queries
commissionHistorySchema.index({ userWallet: 1 });
commissionHistorySchema.index({ userId: 1 });
commissionHistorySchema.index({ chainId: 1 });
commissionHistorySchema.index({ tokenAddress: 1 });
commissionHistorySchema.index({ actionType: 1 });
commissionHistorySchema.index({ transactionHash: 1, logIndex: 1, chainId: 1 });
commissionHistorySchema.index({ blockNumber: -1 });
commissionHistorySchema.index({ createdAt: -1 });
commissionHistorySchema.index({ userWallet: 1, chainId: 1, tokenAddress: 1 });
commissionHistorySchema.index({ userWallet: 1, actionType: 1 });
commissionHistorySchema.index({ relatedUserWallet: 1 });
commissionHistorySchema.index({ relatedUserId: 1 });

export type ICommissionHistoryEntity = InferRawDocType<typeof commissionHistorySchemaDefinition> & {
  _id: Types.ObjectId;
};

export const CommissionHistoryEntity = mongoose.model('CommissionHistory', commissionHistorySchema);
