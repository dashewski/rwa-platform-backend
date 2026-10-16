import mongoose, { Schema, Types, type InferRawDocType } from 'mongoose';

const referrerWithdrawSchemaDefinition = {
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

  // Total amount already withdrawn by this referrer on this chain for this token
  totalWithdrawnAmount: {
    type: mongoose.Schema.Types.Decimal128,
    default: 0,
  },

  // Current withdrawal task information
  taskId: {
    type: String,
    trim: true,
  },
  taskExpiredAt: {
    type: Number,
  },
  taskCooldown: {
    type: Number,
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

const referrerWithdrawSchema = new Schema(referrerWithdrawSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

// Indexes for efficient queries
referrerWithdrawSchema.index({ referrerWallet: 1 });
referrerWithdrawSchema.index({ referrerId: 1 });
referrerWithdrawSchema.index({ chainId: 1 });
referrerWithdrawSchema.index({ tokenAddress: 1 });
referrerWithdrawSchema.index({ referrerWallet: 1, chainId: 1, tokenAddress: 1 }, { unique: true });
referrerWithdrawSchema.index({ taskId: 1 });
referrerWithdrawSchema.index({ taskExpiredAt: 1 });
referrerWithdrawSchema.index({ createdAt: -1 });

export type IReferrerWithdrawEntity = InferRawDocType<typeof referrerWithdrawSchemaDefinition> & {
  _id: Types.ObjectId;
};

export const ReferrerWithdrawEntity = mongoose.model('ReferrerWithdraw', referrerWithdrawSchema);
