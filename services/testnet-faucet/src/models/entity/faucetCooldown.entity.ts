import mongoose, { Schema } from 'mongoose';
import type { InferRawDocType } from 'mongoose';

const faucetCooldownSchemaDefinition = {
  key: {
    type: String,
    required: true,
  },
  unlockAt: {
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

const faucetCooldownSchema = new Schema(faucetCooldownSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

faucetCooldownSchema.index({ key: 1 }, { unique: true });

export type IFaucetCooldownEntity = InferRawDocType<typeof faucetCooldownSchemaDefinition>;
export const FaucetCooldownEntity = mongoose.model('FaucetCooldown', faucetCooldownSchema);
