import mongoose, { Schema } from 'mongoose';
import type { InferRawDocType, Types } from 'mongoose';

const documentsFolderSchemaDefinition = {
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

const documentsFolderSchema = new Schema(documentsFolderSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

documentsFolderSchema.index({ ownerId: 1 });
documentsFolderSchema.index({ creator: 1 });
documentsFolderSchema.index({ parentId: 1 });
documentsFolderSchema.index({ grandParentId: 1 });

export type IDocumentsFolderEntity = InferRawDocType<typeof documentsFolderSchemaDefinition> & {
  _id: Types.ObjectId;
};
export const DocumentsFolderEntity = mongoose.model('DocumentsFolder', documentsFolderSchema);
