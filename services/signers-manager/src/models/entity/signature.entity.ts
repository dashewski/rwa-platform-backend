import mongoose, { Schema } from 'mongoose';
import type { InferRawDocType } from 'mongoose';

const signatureSchemaDefinition = {
  taskId: {
    type: String,
    required: true,
  },
  signer: {
    type: String,
    required: true,
    trim: true,
  },
  signature: {
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

const signatureSchema = new Schema(signatureSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

signatureSchema.index({ taskId: 1 });
signatureSchema.index({ taskId: 1, signer: 1 }, { unique: true });
signatureSchema.index({ createdAt: -1 });

export type ISignature = InferRawDocType<typeof signatureSchemaDefinition>;
export const SignatureEntity = mongoose.model('Signature', signatureSchema);
