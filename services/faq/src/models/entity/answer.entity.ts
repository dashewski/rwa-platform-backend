import mongoose, { Schema, type InferRawDocType, Types } from 'mongoose';

const answerSchemaDefinition = {
  topicId: {
    type: Schema.Types.ObjectId,
    ref: 'Topic',
    required: true,
  },
  ownerId: {
    type: String,
    required: true,
  },
  ownerType: {
    type: String,
    required: true,
  },
  creator: {
    type: String,
    required: true,
  },
  parentId: {
    type: String,
    required: true,
  },
  grandParentId: {
    type: String,
    required: true,
  },
  question: {
    type: String,
    required: true,
    trim: true,
  },
  answer: {
    type: String,
    required: true,
  },
  order: {
    type: Number,
    default: 0,
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

const answerSchema = new Schema(answerSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

answerSchema.index({ ownerId: 1 });
answerSchema.index({ creator: 1 });
answerSchema.index({ parentId: 1 });
answerSchema.index({ grandParentId: 1 });

export type IAnswerEntity = InferRawDocType<typeof answerSchemaDefinition> & {
  _id: Types.ObjectId;
};
export const AnswerEntity = mongoose.model('Answer', answerSchema);
