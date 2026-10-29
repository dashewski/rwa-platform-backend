import mongoose, { Schema } from 'mongoose';
import type { InferRawDocType } from 'mongoose';

const sessionSchemaDefinition = {
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  sessionKey: {
    type: String,
    required: true,
  },
  jti: {
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
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000 + 5 * 60 * 1000),
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

const sessionSchema = new Schema(sessionSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

sessionSchema.index({ userId: 1 });
sessionSchema.index({ sessionKey: 1 }, { unique: true });
sessionSchema.index({ ttlDate: 1 }, { expireAfterSeconds: 0 });

export type ISessionEntity = InferRawDocType<typeof sessionSchemaDefinition>;
export const SessionEntity = mongoose.model('Session', sessionSchema);
