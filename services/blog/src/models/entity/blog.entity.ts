import mongoose, { Schema, Types } from 'mongoose';
import type { InferRawDocType } from 'mongoose';

const blogSchemaDefinition = {
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

const blogSchema = new Schema(blogSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

blogSchema.index({ ownerId: 1 });
blogSchema.index({ creator: 1 });
blogSchema.index({ parentId: 1 });
blogSchema.index({ grandParentId: 1 });

export type IBlogEntity = InferRawDocType<typeof blogSchemaDefinition> & { _id: Types.ObjectId };
export const BlogEntity = mongoose.model('Blog', blogSchema);
