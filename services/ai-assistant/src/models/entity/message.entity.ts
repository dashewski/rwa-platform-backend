import mongoose, { Schema } from 'mongoose';
import type { InferRawDocType } from 'mongoose';
import { MessageSenderList } from '../shared/enums.model';
const messageSchemaDefinition = {
  assistantId: {
    type: String,
    required: true,
  },
  text: {
    type: String,
    required: true,
    trim: true,
  },
  sender: {
    type: String,
    enum: MessageSenderList,
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

const messageSchema = new Schema(messageSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

messageSchema.index({ assistantId: 1 });

export type IMessageEntity = InferRawDocType<typeof messageSchemaDefinition>;
export const MessageEntity = mongoose.model('Message', messageSchema);
