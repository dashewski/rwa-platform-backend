import mongoose, { Schema } from 'mongoose';
import type { InferRawDocType } from 'mongoose';

const challengeSchemaDefinition = {
  nonce: {
    type: String,
    required: true,
  },
  wallet: {
    type: String,
    required: true,
  },
  expiresAt: {
    type: Number,
    required: true,
  },
  ttlDate: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 3 * 60 * 1000),
  },
  createdAt: {
    type: Number,
    default: () => Math.floor(Date.now() / 1000),
  },
} as const;

const challengeSchema = new Schema(challengeSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

challengeSchema.index({ nonce: 1 }, { unique: true });
challengeSchema.index({ wallet: 1 });
challengeSchema.index({ ttlDate: 1 }, { expireAfterSeconds: 0 });

export type IChallengeEntity = InferRawDocType<typeof challengeSchemaDefinition>;
export const ChallengeEntity = mongoose.model('Challenge', challengeSchema);
