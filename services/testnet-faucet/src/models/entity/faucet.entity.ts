import mongoose, { Schema } from 'mongoose';
import type { InferRawDocType } from 'mongoose';
import { FaucetTokenTypeList } from '../shared/enums.model';

const faucetRequestSchemaDefinition = {
  userId: {
    type: String,
    required: true,
    index: true,
  },
  wallet: {
    type: String,
    required: true,
    lowercase: true,
    index: true,
  },
  tokenType: {
    type: String,
    enum: FaucetTokenTypeList,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  transactionHash: {
    type: String,
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

const faucetRequestSchema = new Schema(faucetRequestSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

faucetRequestSchema.index({ userId: 1, tokenType: 1, createdAt: -1 });
faucetRequestSchema.index({ wallet: 1, tokenType: 1 });

export type IFaucetRequestEntity = InferRawDocType<typeof faucetRequestSchemaDefinition>;
export const FaucetRequestEntity = mongoose.model('FaucetRequest', faucetRequestSchema);
