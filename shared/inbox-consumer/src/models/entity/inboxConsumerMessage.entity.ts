import mongoose, { Schema } from 'mongoose';
import type { InferRawDocType, Types } from 'mongoose';

const inboxConsumerMessageSchemaDefinition = {
  messageId: {
    type: String,
    required: true,
    trim: true,
  },
  createdAt: {
    type: Number,
    default: () => Math.floor(Date.now() / 1000),
  },
  updatedAt: {
    type: Number,
    default: () => Math.floor(Date.now() / 1000),
  },
  ttlDate: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  },
} as const;

export const inboxConsumerMessageSchema = new Schema(inboxConsumerMessageSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

inboxConsumerMessageSchema.index({ messageId: 1 }, { unique: true });
inboxConsumerMessageSchema.index({ ttlDate: 1 }, { expireAfterSeconds: 0 });

type InferredInboxConsumerMessage = InferRawDocType<typeof inboxConsumerMessageSchemaDefinition>;

export type IInboxConsumerMessageEntity = InferredInboxConsumerMessage & {
  _id: Types.ObjectId;
};
export const InboxConsumerMessageEntity = mongoose.model('InboxConsumerMessage', inboxConsumerMessageSchema);
