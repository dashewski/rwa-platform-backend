import mongoose, { Schema } from 'mongoose';
import type { InferRawDocType, Types } from 'mongoose';
import { EntityTypeList } from '../shared/enums.model';

const evaluationJobSchemaDefinition = {
  evaluationId: {
    type: Schema.Types.ObjectId,
    required: true,
  },
  entityType: {
    type: String,
    required: true,
    enum: EntityTypeList,
  },
  entityId: {
    type: String,
    required: true,
    trim: true,
  },
  ownerId: {
    type: String,
    required: true,
    trim: true,
  },
  ownerType: {
    type: String,
    required: true,
    trim: true,
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'running', 'completed', 'failed'],
    default: 'pending',
  },
  attempts: {
    type: Number,
    required: true,
    default: 0,
  },
  lockedUntil: {
    type: Date,
  },
  error: {
    type: String,
  },
  ttlDate: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
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

const evaluationJobSchema = new Schema(evaluationJobSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

evaluationJobSchema.index({ status: 1, createdAt: 1 });
evaluationJobSchema.index({ status: 1, lockedUntil: 1 });
evaluationJobSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
evaluationJobSchema.index({ ttlDate: 1 }, { expireAfterSeconds: 0 });

export type IEvaluationJobEntity = InferRawDocType<typeof evaluationJobSchemaDefinition> & {
  _id: Types.ObjectId;
};

export const EvaluationJobEntity = mongoose.model('EvaluationJob', evaluationJobSchema);
