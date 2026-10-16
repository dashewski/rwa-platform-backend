import mongoose, { Schema, Types } from 'mongoose';
import type { InferRawDocType } from 'mongoose';

const questionSchemaDefinition = {
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
  text: {
    type: String,
    required: true,
    trim: true,
  },
  answer: {
    type: {
      text: {
        type: String,
        required: true,
        trim: true,
      },
      userId: {
        type: String,
        required: true,
      },
      createdAt: {
        type: Number,
        required: true,
      },
      updatedAt: {
        type: Number,
        required: true,
      },
    },
  },
  answered: {
    type: Boolean,
    default: false,
  },
  likesCount: {
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

const questionSchema = new Schema(questionSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

questionSchema.index({ ownerId: 1 });
questionSchema.index({ creator: 1 });
questionSchema.index({ parentId: 1 });
questionSchema.index({ grandParentId: 1 });

export type IQuestionEntity = InferRawDocType<typeof questionSchemaDefinition> & {
  _id: Types.ObjectId;
};
export const QuestionEntity = mongoose.model('Question', questionSchema);
