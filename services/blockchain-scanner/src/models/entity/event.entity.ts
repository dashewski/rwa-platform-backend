import mongoose, { Schema } from 'mongoose';
import type { InferRawDocType } from 'mongoose';

const eventSchemaDefinition = {
  chainId: {
    type: Number,
    required: true,
  },
  blockNumber: {
    type: Number,
    required: true,
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
  address: {
    type: String,
    required: true,
    trim: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  data: {
    type: Schema.Types.Mixed,
    required: true,
  },
  timestamp: {
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

const eventSchema = new Schema(eventSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

// Unique compound index to prevent duplicate events
eventSchema.index({ chainId: 1, blockNumber: 1, transactionHash: 1, logIndex: 1 }, { unique: true });

// Indexes for searching
eventSchema.index({ chainId: 1, blockNumber: 1 });
eventSchema.index({ address: 1 });
eventSchema.index({ name: 1 }); // Fix: use 'name' instead of non-existent 'event' field

export type IEventEntity = InferRawDocType<typeof eventSchemaDefinition>;
export const EventEntity = mongoose.model('Event', eventSchema);
