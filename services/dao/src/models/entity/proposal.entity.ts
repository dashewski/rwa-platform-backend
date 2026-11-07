import mongoose, { Schema, Types } from 'mongoose';
import type { InferRawDocType } from 'mongoose';
import { ProposalStateList } from '../shared/enums.model';

const proposalSchemaDefinition = {
  proposalId: {
    type: String,
    required: true,
    trim: true,
  },
  proposer: {
    type: String,
    required: true,
    trim: true,
  },
  target: {
    type: String,
    required: true,
    trim: true,
  },
  data: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  creationTime: {
    type: Number,
    required: true,
  },
  endTime: {
    type: Number,
    required: true,
  },
  state: {
    type: String,
    enum: ProposalStateList,
    default: 'pending',
  },
  /** Who auto-executed (the Governance contract) - Governance_ProposalExecuted. */
  executor: {
    type: String,
    trim: true,
  },
  /** Who cancelled: the proposer (manual, <=12h) or the Governance contract (votes against). */
  canceller: {
    type: String,
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

const proposalSchema = new Schema(proposalSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

// Indexes for efficient queries
proposalSchema.index({ proposalId: 1 }, { unique: true });
proposalSchema.index({ proposer: 1 });
proposalSchema.index({ chainId: 1 });
proposalSchema.index({ state: 1 });
proposalSchema.index({ creationTime: 1 });
proposalSchema.index({ endTime: 1 });
proposalSchema.index({ transactionHash: 1 });
proposalSchema.index({ createdAt: -1 });

export type IProposalEntity = InferRawDocType<typeof proposalSchemaDefinition> & {
  _id: Types.ObjectId;
};

export const ProposalEntity = mongoose.model('Proposal', proposalSchema);
