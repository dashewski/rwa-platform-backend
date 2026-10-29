import type { Resolvers } from '../../../generated/types';
import { getTopic } from './queries/getTopic';
import { getTopics } from './queries/getTopics';
import { getQuestion } from './queries/getQuestion';
import { getQuestions } from './queries/getQuestions';
import { createTopic } from './mutations/createTopic';
import { updateTopic } from './mutations/updateTopic';
import { deleteTopic } from './mutations/deleteTopic';
import { createQuestion } from './mutations/createQuestion';
import { updateQuestionText } from './mutations/updateQuestionText';
import { updateQuestionAnswer } from './mutations/updateQuestionAnswer';
import { deleteQuestion } from './mutations/deleteQuestion';
import { toggleQuestionLike } from './mutations/toggleQuestionLike';
import { createQuestionAnswer } from './mutations/createQuestionAnswer';

export const questionsResolvers: Resolvers = {
  Query: {
    getTopic,
    getTopics,
    getQuestion,
    getQuestions,
  },
  Mutation: {
    createTopic,
    updateTopic,
    deleteTopic,
    createQuestion,
    updateQuestionText,
    createQuestionAnswer,
    updateQuestionAnswer,
    deleteQuestion,
    toggleQuestionLike,
  },
};
