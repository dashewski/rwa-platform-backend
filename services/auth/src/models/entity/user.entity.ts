import mongoose, { Schema } from 'mongoose';
import type { InferRawDocType } from 'mongoose';

const userSchemaDefinition = {
  wallet: {
    type: String,
    required: true,
    lowercase: true,
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

const userSchema = new Schema(userSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

userSchema.index({ wallet: 1 }, { unique: true });

export type IUserEntity = InferRawDocType<typeof userSchemaDefinition>;
export const UserEntity = mongoose.model('User', userSchema);
