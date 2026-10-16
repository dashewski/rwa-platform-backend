import mongoose, { Schema, Types } from 'mongoose';
import type { InferRawDocType } from 'mongoose';

const deliveryLogSchemaDefinition = {
  endpointId: {
    type: Schema.Types.ObjectId,
    required: true,
    index: true,
  },
  eventType: {
    type: String,
    required: true,
  },
  eventId: {
    type: String,
    required: true,
  },
  payload: {
    type: Object,
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'delivered', 'failed', 'dead_letter'],
    default: 'pending',
  },
  attempts: {
    type: [
      {
        timestamp: { type: Number, default: () => Math.floor(Date.now() / 1000) },
        statusCode: { type: Number },
        responseBody: { type: String, default: '' },
        error: { type: String, default: '' },
      },
    ],
    default: [],
  },
  nextRetryAt: {
    type: Number,
    default: null,
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

const deliveryLogSchema = new Schema(deliveryLogSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

deliveryLogSchema.index({ endpointId: 1, eventId: 1 }, { unique: true });
deliveryLogSchema.index({ status: 1, nextRetryAt: 1 });
// Delivery logs are kept for 30 days; older records expire automatically.
deliveryLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export type IDeliveryLogEntity = InferRawDocType<typeof deliveryLogSchemaDefinition> & { _id: Types.ObjectId };
export const DeliveryLogEntity = mongoose.model('WebhookDeliveryLog', deliveryLogSchema);
