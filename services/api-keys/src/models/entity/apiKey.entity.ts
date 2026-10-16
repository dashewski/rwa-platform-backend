import mongoose, { Schema } from 'mongoose';
import type { InferRawDocType } from 'mongoose';

const apiKeySchemaDefinition = {
  userId: {
    type: String,
    required: true,
    trim: true,
  },
  wallet: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  keyHash: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  prefix: {
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

const apiKeySchema = new Schema(apiKeySchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

apiKeySchema.index({ userId: 1 });
apiKeySchema.index({ keyHash: 1 }, { unique: true });

export type IApiKeyEntity = InferRawDocType<typeof apiKeySchemaDefinition>;
export const ApiKeyEntity = mongoose.model('ApiKey', apiKeySchema);
