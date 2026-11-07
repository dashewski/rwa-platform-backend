import mongoose, { Schema, Types } from 'mongoose';
import type { InferRawDocType } from 'mongoose';

const topicSchemaDefinition = {
  name: {
    type: String,
    required: true,
    trim: true,
  },
  ownerId: {
    type: String,
    required: true,
  },
  ownerType: {
    type: String,
    required: true,
  },
  creator: {
    type: String,
    required: true,
  },
  parentId: {
    type: String,
    required: true,
  },
  grandParentId: {
    type: String,
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

const topicSchema = new Schema(topicSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

topicSchema.index({ ownerId: 1 });
topicSchema.index({ parentId: 1 });
topicSchema.index({ grandParentId: 1 });

export type ITopicEntity = InferRawDocType<typeof topicSchemaDefinition> & { _id: Types.ObjectId };
export const TopicEntity = mongoose.model('Topic', topicSchema);
