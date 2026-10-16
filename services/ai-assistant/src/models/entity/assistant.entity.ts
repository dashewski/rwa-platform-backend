import mongoose, { Schema } from 'mongoose';
import type { InferRawDocType } from 'mongoose';
import { AssistantContextList } from '../shared/enums.model';

const assistantSchemaDefinition = {
  userId: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  contextPreferences: {
    type: [{ type: String, enum: AssistantContextList }],
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

const assistantSchema = new Schema(assistantSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

assistantSchema.index({ userId: 1 });

export type IAssistantEntity = InferRawDocType<typeof assistantSchemaDefinition>;
export const AssistantEntity = mongoose.model('Assistant', assistantSchema);
