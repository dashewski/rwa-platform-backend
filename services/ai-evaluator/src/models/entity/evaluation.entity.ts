import mongoose, { Schema } from 'mongoose';
import type { InferRawDocType, Types } from 'mongoose';
import { EntityTypeList } from '../shared/enums.model';

const evaluationSchemaDefinition = {
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
  grandParentId: {
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
  riskScore: {
    type: Number,
    min: 1,
    max: 100,
  },
  reasoning: {
    type: String,
  },
  factors: {
    type: [
      {
        name: { type: String, required: true },
        impact: { type: String, required: true },
        detail: { type: String, required: true },
      },
    ],
    default: [],
  },
  stage1Response: {
    type: String,
  },
  stage2Response: {
    type: String,
  },
  evaluatedDocuments: {
    type: [
      {
        id: { type: String, required: true },
        name: { type: String, required: true },
        mimeType: { type: String, required: true },
      },
    ],
    default: [],
  },
  evaluatedImages: {
    type: [
      {
        id: { type: String, required: true },
        name: { type: String, required: true },
      },
    ],
    default: [],
  },
  modelUsed: {
    type: String,
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

const evaluationSchema = new Schema(evaluationSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

evaluationSchema.index({ parentId: 1 });
evaluationSchema.index({ grandParentId: 1 });
evaluationSchema.index({ ownerId: 1 });
evaluationSchema.index({ parentId: 1, createdAt: -1 });
evaluationSchema.index({ entityType: 1, parentId: 1 });

export type IEvaluationEntity = InferRawDocType<typeof evaluationSchemaDefinition> & {
  _id: Types.ObjectId;
};

export const EvaluationEntity = mongoose.model('Evaluation', evaluationSchema);
