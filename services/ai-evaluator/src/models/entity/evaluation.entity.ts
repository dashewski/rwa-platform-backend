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
    trim: true,
    default: null,
  },
  ownerId: {
    type: String,
    trim: true,
    default: null,
  },
  ownerType: {
    type: String,
    trim: true,
    default: null,
  },
  context: {
    type: {
      text: { type: String, required: true },
      files: [
        {
          id: { type: String, required: true },
          name: { type: String, required: true },
          mimeType: { type: String, required: true },
          url: { type: String, required: true },
        },
      ],
    },
    default: null,
  },
  selection: {
    type: {
      files: [
        {
          id: { type: String, required: true },
          name: { type: String, required: true },
          mimeType: { type: String, required: true },
          url: { type: String, required: true },
        },
      ],
    },
    default: null,
  },
  risk: {
    score: {
      type: Number,
      min: 1,
      max: 100,
      default: null,
    },
    pros: {
      type: [String],
      default: [],
    },
    cons: {
      type: [String],
      default: [],
    },
  },
  summary: {
    type: String,
    default: null,
  },
  sources: {
    type: [
      {
        type: { type: String, required: true },
        id: { type: String, required: true },
        name: { type: String, required: true },
        mimeType: { type: String, required: true },
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
  completed: {
    type: Boolean,
    default: false,
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
