import mongoose, { Schema, Types } from 'mongoose';
import type { InferRawDocType } from 'mongoose';

const transactionSchemaDefinition = {
  from: {
    type: String,
    required: true,
    trim: true,
  },
  to: {
    type: String,
    required: true,
    trim: true,
  },
  tokenAddress: {
    type: String,
    required: true,
    trim: true,
  },
  tokenId: {
    type: String,
    required: true,
    trim: true,
  },
  poolAddress: {
    type: String,
    required: true,
    trim: true,
  },
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
  amount: {
    type: Number,
    required: true,
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

const transactionSchema = new Schema(transactionSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

transactionSchema.index({ from: 1, createdAt: -1 });
transactionSchema.index({ to: 1, createdAt: -1 });

transactionSchema.index({ transactionHash: 1 });

transactionSchema.index({ poolAddress: 1 });
transactionSchema.index({ tokenAddress: 1, chainId: 1 });

transactionSchema.index({ blockNumber: 1 });

export type ITransactionEntity = InferRawDocType<typeof transactionSchemaDefinition> & {
  _id: Types.ObjectId;
};
export const TransactionEntity = mongoose.model('Transaction', transactionSchema);
