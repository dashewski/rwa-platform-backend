import mongoose, { Schema, Types } from 'mongoose';
import type { InferRawDocType } from 'mongoose';

const processedMessageSchemaDefinition = {
  key: {
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
} as const;

const processedMessageSchema = new Schema(processedMessageSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

processedMessageSchema.index({ key: 1 }, { unique: true });

export type IProcessedMessageEntity = InferRawDocType<typeof processedMessageSchemaDefinition> & {
  _id: Types.ObjectId;
};
export const ProcessedMessageEntity = mongoose.model('ProcessedMessage', processedMessageSchema);
