import type { Resolvers } from '../../../generated/types';
import { getEvaluation } from './queries/getEvaluation';
import { getEvaluations } from './queries/getEvaluations';

export const aiEvaluatorResolvers: Resolvers = {
  Query: {
    getEvaluation,
    getEvaluations,
  },
};
