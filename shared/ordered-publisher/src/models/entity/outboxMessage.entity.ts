import mongoose, { Schema, Types } from 'mongoose';
import type { InferRawDocType } from 'mongoose';

const outboxMessageSchemaDefinition = {
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
    enum: ['pending', 'sending', 'sent'],
    default: 'pending',
    index: true,
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
} as const;

const outboxMessageSchema = new Schema(outboxMessageSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

type InferredOutboxMessage = InferRawDocType<typeof outboxMessageSchemaDefinition>;

export type IOutboxMessageEntity = InferredOutboxMessage & {
  _id: Types.ObjectId;
};
export const OutboxMessageEntity = mongoose.model('OutboxMessage', outboxMessageSchema);
