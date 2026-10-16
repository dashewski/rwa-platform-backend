import mongoose, { Schema, type InferRawDocType } from 'mongoose';

const fileSchemaDefinition = {
  name: {
    type: String,
    required: true,
    trim: true,
  },
  path: {
    type: String,
    required: true,
    unique: true,
  },
  size: {
    type: Number,
    required: true,
  },
  mimeType: {
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

const fileSchema = new Schema(fileSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

fileSchema.index({ path: 1 });

export type IFileEntity = InferRawDocType<typeof fileSchemaDefinition>;
export const FileEntity = mongoose.model('File', fileSchema);
