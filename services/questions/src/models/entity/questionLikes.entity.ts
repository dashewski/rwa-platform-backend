import mongoose, { Schema, Types } from 'mongoose';
import type { InferRawDocType } from 'mongoose';

const questionLikesSchemaDefinition = {
  questionId: {
    type: Schema.Types.ObjectId,
    ref: 'Question',
    required: true,
  },
  userId: {
    type: String,
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

const questionLikesSchema = new Schema(questionLikesSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

questionLikesSchema.index({ questionId: 1, userId: 1 }, { unique: true });

export type IQuestionLikesEntity = InferRawDocType<typeof questionLikesSchemaDefinition> & {
  _id: Types.ObjectId;
};
export const QuestionLikesEntity = mongoose.model('QuestionLikes', questionLikesSchema);
