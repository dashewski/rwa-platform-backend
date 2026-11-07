import mongoose, { Schema } from 'mongoose';
import type { InferRawDocType } from 'mongoose';

const refreshTokenSchemaDefinition = {
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  tokenHash: {
    type: String,
    required: true,
    unique: true,
  },
  expiresAt: {
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

const refreshTokenSchema = new Schema(refreshTokenSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

// Indexes for performance
refreshTokenSchema.index({ userId: 1 });
refreshTokenSchema.index({ tokenHash: 1 }, { unique: true });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // For cleanup of expired tokens

export type IRefreshTokenEntity = InferRawDocType<typeof refreshTokenSchemaDefinition>;
export const RefreshTokenEntity = mongoose.model('RefreshToken', refreshTokenSchema);
