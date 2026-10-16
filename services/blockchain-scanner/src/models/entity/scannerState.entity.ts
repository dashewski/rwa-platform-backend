import mongoose, { Schema } from 'mongoose';
import type { InferRawDocType } from 'mongoose';

const scannerStateSchemaDefinition = {
  chainId: {
    type: Number,
    required: true,
  },
  lastScannedBlock: {
    type: Number,
    required: true,
  },
  isActive: {
    type: Boolean,
    required: true,
    default: true,
  },
  error: {
    type: String,
    required: false,
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

const scannerStateSchema = new Schema(scannerStateSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

scannerStateSchema.index({ chainId: 1 }, { unique: true });
scannerStateSchema.index({ isActive: 1 });

export type IScannerStateEntity = InferRawDocType<typeof scannerStateSchemaDefinition>;
export const ScannerStateEntity = mongoose.model('ScannerState', scannerStateSchema);
