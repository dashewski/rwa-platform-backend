import mongoose, { Schema, Types } from 'mongoose';
import type { InferRawDocType } from 'mongoose';

const memberSchemaDefinition = {
  companyId: {
    type: Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
  },
  userId: {
    type: String,
    required: true,
  },
  name: {
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

const memberSchema = new Schema(memberSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

memberSchema.index({ companyId: 1, userId: 1 }, { unique: true });
memberSchema.index({ companyId: 1 });
memberSchema.index({ userId: 1 });

export type IMemberEntity = InferRawDocType<typeof memberSchemaDefinition> & {
  _id: Types.ObjectId;
};
export const MemberEntity = mongoose.model('Member', memberSchema);
