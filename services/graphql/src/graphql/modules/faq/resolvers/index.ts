import type { Resolvers } from '../../../generated/types';
import { getFaqTopic } from './queries/getFaqTopic';
import { getFaqTopics } from './queries/getFaqTopics';
import { getFaqAnswer } from './queries/getFaqAnswer';
import { getFaqAnswers } from './queries/getFaqAnswers';
import { createFaqTopic } from './mutations/createFaqTopic';
import { updateFaqTopic } from './mutations/updateFaqTopic';
import { deleteFaqTopic } from './mutations/deleteFaqTopic';
import { createFaqAnswer } from './mutations/createFaqAnswer';
import { updateFaqAnswer } from './mutations/updateFaqAnswer';
import { deleteFaqAnswer } from './mutations/deleteFaqAnswer';

export const faqResolvers: Resolvers = {
  Query: {
    getFaqTopic,
    getFaqTopics,
    getFaqAnswer,
    getFaqAnswers,
  },
  Mutation: {
    createFaqTopic,
    updateFaqTopic,
    deleteFaqTopic,
    createFaqAnswer,
    updateFaqAnswer,
    deleteFaqAnswer,
  },
};
