import mongoose, { Schema, Types } from 'mongoose';
import type { InferRawDocType } from 'mongoose';

const treasuryWithdrawSchemaDefinition = {
  recipient: {
    type: String,
    required: true,
    trim: true,
  },
  token: {
    type: String,
    required: true,
    trim: true,
  },
  amount: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
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

const treasuryWithdrawSchema = new Schema(treasuryWithdrawSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

// Indexes for efficient queries
treasuryWithdrawSchema.index({ recipient: 1 });
treasuryWithdrawSchema.index({ token: 1 });
treasuryWithdrawSchema.index({ chainId: 1 });
treasuryWithdrawSchema.index({ chainId: 1, recipient: 1 });
treasuryWithdrawSchema.index({ chainId: 1, token: 1 });
treasuryWithdrawSchema.index({ transactionHash: 1, logIndex: 1 }, { unique: true });
treasuryWithdrawSchema.index({ createdAt: -1 });

export type ITreasuryWithdrawEntity = InferRawDocType<typeof treasuryWithdrawSchemaDefinition> & {
  _id: Types.ObjectId;
};

export const TreasuryWithdrawEntity = mongoose.model('TreasuryWithdraw', treasuryWithdrawSchema);
