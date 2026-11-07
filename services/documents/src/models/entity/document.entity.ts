import mongoose, { Schema } from 'mongoose';
import type { InferRawDocType, Types } from 'mongoose';

const documentSchemaDefinition = {
  folderId: {
    type: Schema.Types.ObjectId,
    ref: 'DocumentsFolder',
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

const documentSchema = new Schema(documentSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

documentSchema.index({ ownerId: 1 });
documentSchema.index({ creator: 1 });
documentSchema.index({ parentId: 1 });
documentSchema.index({ grandParentId: 1 });

export type IDocumentEntity = InferRawDocType<typeof documentSchemaDefinition> & {
  _id: Types.ObjectId;
};
export const DocumentEntity = mongoose.model('Document', documentSchema);
