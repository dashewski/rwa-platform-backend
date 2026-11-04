import type { Resolvers } from '../../../generated/types';
import { getEvaluation } from './queries/getEvaluation';
import { getEvaluations } from './queries/getEvaluations';
import { updateBusinessRiskScore } from './mutations/updateBusinessRiskScore';
import { updatePoolRiskScore } from './mutations/updatePoolRiskScore';

export const aiEvaluatorResolvers: Resolvers = {
  Query: {
    getEvaluation,
    getEvaluations,
  },
  Mutation: {
    updateBusinessRiskScore,
    updatePoolRiskScore,
  },
};
