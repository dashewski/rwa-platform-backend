import mongoose, { Schema, Types } from 'mongoose';
import type { InferRawDocType } from 'mongoose';

const timelockTaskSchemaDefinition = {
  txHash: {
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
  eta: {
    type: Number,
    required: true,
  },
  executed: {
    type: Boolean,
    default: false,
  },
  cancelled: {
    type: Boolean,
    default: false,
  },
  chainId: {
    type: String,
    required: true,
    trim: true,
  },
  /** Envelope of the event that queued the task (see the blockchain event root). */
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

const timelockTaskSchema = new Schema(timelockTaskSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

// Indexes for efficient queries
timelockTaskSchema.index({ chainId: 1, txHash: 1 }, { unique: true });
timelockTaskSchema.index({ chainId: 1 });
timelockTaskSchema.index({ executed: 1 });
timelockTaskSchema.index({ cancelled: 1 });
timelockTaskSchema.index({ eta: 1 });
timelockTaskSchema.index({ createdAt: -1 });

export type ITimelockTaskEntity = InferRawDocType<typeof timelockTaskSchemaDefinition> & {
  _id: Types.ObjectId;
};

export const TimelockTaskEntity = mongoose.model('TimelockTask', timelockTaskSchema);
