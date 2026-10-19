import mongoose, { Schema } from 'mongoose';
import type { InferRawDocType, Types } from 'mongoose';

const outboxPublisherMessageSchemaDefinition = {
  exchange: {
    type: String,
    required: true,
    trim: true,
  },
  routingKey: {
    type: String,
    required: true,
    trim: true,
  },
  payload: {
    type: Schema.Types.Mixed,
    required: true,
  },
  messageId: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'sending', 'sent', 'failed'],
    default: 'pending',
  },
  attempts: {
    type: Number,
    default: 0,
  },
  sentAt: {
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
  expiresAt: {
    type: Date,
    default: null,
  },
} as const;

export const outboxPublisherMessageSchema = new Schema(outboxPublisherMessageSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

outboxPublisherMessageSchema.index({ exchange: 1, status: 1, _id: 1 });
outboxPublisherMessageSchema.index({ exchange: 1, messageId: 1 }, { unique: true });
outboxPublisherMessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

type InferredOutboxPublisherMessage = InferRawDocType<typeof outboxPublisherMessageSchemaDefinition>;

export type IOutboxPublisherMessageEntity = InferredOutboxPublisherMessage & {
  _id: Types.ObjectId;
};
export const OutboxPublisherMessageEntity = mongoose.model(
  'OutboxPublisherMessage',
  outboxPublisherMessageSchema,
);
