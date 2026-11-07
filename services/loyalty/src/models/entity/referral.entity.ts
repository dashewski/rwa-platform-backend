import mongoose, { Schema, Types, type InferRawDocType } from 'mongoose';

const referralSchemaDefinition = {
  userWallet: {
    type: String,
    required: true,
    trim: true,
  },
  userId: {
    type: String,
    required: true,
    trim: true,
  },
  referrerWallet: {
    type: String,
    trim: true,
  },
  referrerId: {
    type: String,
    trim: true,
  },

  // Timestamps
  createdAt: {
    type: Number,
    default: () => Math.floor(Date.now() / 1000),
  },
  updatedAt: {
    type: Number,
    default: () => Math.floor(Date.now() / 1000),
  },
} as const;

const referralSchema = new Schema(referralSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

// Indexes for efficient queries
referralSchema.index({ userWallet: 1 }, { unique: true });
referralSchema.index({ userId: 1 }, { unique: true });
referralSchema.index({ referrerWallet: 1 });
referralSchema.index({ referrerId: 1 });
referralSchema.index({ createdAt: -1 });

export type IReferralEntity = InferRawDocType<typeof referralSchemaDefinition> & {
  _id: Types.ObjectId;
};

export const ReferralEntity = mongoose.model('Referral', referralSchema);
