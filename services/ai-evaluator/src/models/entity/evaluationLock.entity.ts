import mongoose, { Schema } from 'mongoose';
import type { InferRawDocType, Types } from 'mongoose';
import { EntityTypeList } from '../shared/enums.model';

const evaluationLockSchemaDefinition = {
  entityType: {
    type: String,
    required: true,
    enum: EntityTypeList,
  },
  parentId: {
    type: String,
    required: true,
    trim: true,
  },
  cooldownUntil: {
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

const evaluationLockSchema = new Schema(evaluationLockSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

evaluationLockSchema.index({ entityType: 1, parentId: 1 }, { unique: true });

export type IEvaluationLockEntity = InferRawDocType<typeof evaluationLockSchemaDefinition> & {
  _id: Types.ObjectId;
};

export const EvaluationLockEntity = mongoose.model('EvaluationLock', evaluationLockSchema);
