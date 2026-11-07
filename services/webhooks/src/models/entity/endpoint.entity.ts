import mongoose, { Schema, Types } from 'mongoose';
import type { InferRawDocType } from 'mongoose';

const endpointSchemaDefinition = {
  userId: {
    type: String,
    required: true,
    index: true,
  },
  wallet: {
    type: String,
    required: true,
  },
  url: {
    type: String,
    required: true,
  },
  secret: {
    type: String,
    required: true,
  },
  events: {
    type: [String],
    required: true,
    default: [],
  },
  description: {
    type: String,
    default: '',
  },
  active: {
    type: Boolean,
    default: true,
    index: true,
  },
  rateLimitPerMinute: {
    type: Number,
    default: 100,
  },
  consecutiveFailures: {
    type: Number,
    default: 0,
  },
  maxAttempts: {
    type: Number,
    default: 8,
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

const endpointSchema = new Schema(endpointSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

endpointSchema.index({ userId: 1 });
endpointSchema.index({ active: 1 });
endpointSchema.index({ events: 1 });

export type IEndpointEntity = InferRawDocType<typeof endpointSchemaDefinition> & { _id: Types.ObjectId };
export const EndpointEntity = mongoose.model('WebhookEndpoint', endpointSchema);
