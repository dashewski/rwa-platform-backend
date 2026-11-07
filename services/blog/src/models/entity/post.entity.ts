import mongoose, { Schema, Types } from 'mongoose';
import type { InferRawDocType } from 'mongoose';

const postSchemaDefinition = {
  blogId: {
    type: Schema.Types.ObjectId,
    ref: 'Blog',
    required: true,
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
  title: {
    type: String,
    required: true,
    trim: true,
  },
  content: {
    type: String,
    required: true,
  },
  images: {
    type: [String],
    default: [],
  },
  documents: {
    type: [String],
    default: [],
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

const postSchema = new Schema(postSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

postSchema.index({ ownerId: 1 });
postSchema.index({ creator: 1 });
postSchema.index({ parentId: 1 });
postSchema.index({ grandParentId: 1 });

export type IPostEntity = InferRawDocType<typeof postSchemaDefinition> & { _id: Types.ObjectId };
export const PostEntity = mongoose.model('Post', postSchema);
