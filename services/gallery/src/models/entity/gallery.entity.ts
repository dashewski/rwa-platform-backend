import mongoose, { Schema, type InferRawDocType, Types } from 'mongoose';

const gallerySchemaDefinition = {
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

const gallerySchema = new Schema(gallerySchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

gallerySchema.index({ ownerId: 1 });
gallerySchema.index({ creator: 1 });
gallerySchema.index({ parentId: 1 });
gallerySchema.index({ grandParentId: 1 });

export type IGalleryEntity = InferRawDocType<typeof gallerySchemaDefinition> & {
  _id: Types.ObjectId;
};
export const GalleryEntity = mongoose.model('Gallery', gallerySchema);
