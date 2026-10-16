import mongoose, { Schema, type InferRawDocType, Types } from 'mongoose';

const imageSchemaDefinition = {
  galleryId: {
    type: Schema.Types.ObjectId,
    ref: 'Gallery',
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
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    default: '',
    trim: true,
  },
  fileId: {
    type: String,
    required: true,
  },
  path: {
    type: String,
    required: true,
    trim: true,
  },
  mimeType: {
    type: String,
    required: true,
    trim: true,
  },
  size: {
    type: Number,
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

const imageSchema = new Schema(imageSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

imageSchema.index({ ownerId: 1 });
imageSchema.index({ creator: 1 });
imageSchema.index({ parentId: 1 });
imageSchema.index({ grandParentId: 1 });

export type IImageEntity = InferRawDocType<typeof imageSchemaDefinition> & { _id: Types.ObjectId };
export const ImageEntity = mongoose.model('Image', imageSchema);
