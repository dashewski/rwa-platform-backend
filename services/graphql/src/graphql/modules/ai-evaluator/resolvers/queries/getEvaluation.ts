import { AppError } from '@shared/errors/app-errors';
import type { QueryResolvers } from '../../../../generated/types';

export const getEvaluation: QueryResolvers['getEvaluation'] = async (_parent, { id }, { clients, user }) => {
  const response = await clients.aiEvaluatorClient.getEvaluation.post({
    id,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to get evaluation',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  return response.data;
};
