import mongoose, { Schema, Types } from 'mongoose';
import type { InferRawDocType } from 'mongoose';

const voteSchemaDefinition = {
  proposalId: {
    type: String,
    required: true,
    trim: true,
  },
  chainId: {
    type: String,
    required: true,
    trim: true,
  },
  governanceAddress: {
    type: String,
    required: true,
    trim: true,
  },
  voterWallet: {
    type: String,
    required: true,
    trim: true,
  },
  support: {
    type: Boolean,
    required: true,
  },
  weight: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
  },
  reason: {
    type: String,
    default: '',
  },

  // Blockchain data
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

const voteSchema = new Schema(voteSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

// Indexes for efficient queries
voteSchema.index({ proposalId: 1 });
voteSchema.index({ voterWallet: 1 });
voteSchema.index({ chainId: 1 });
voteSchema.index({ governanceAddress: 1 });
voteSchema.index({ proposalId: 1, voterWallet: 1 }, { unique: true });
voteSchema.index({ chainId: 1, governanceAddress: 1 });
voteSchema.index({ transactionHash: 1, logIndex: 1 }, { unique: true });
voteSchema.index({ createdAt: -1 });

export type IVoteEntity = InferRawDocType<typeof voteSchemaDefinition> & { _id: Types.ObjectId };

export const VoteEntity = mongoose.model('Vote', voteSchema);
