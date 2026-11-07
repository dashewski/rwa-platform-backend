import { AppError } from '@shared/errors/app-errors';
import type { MutationResolvers } from '../../../../generated/types';

export const requestPoolEvaluation: MutationResolvers['requestPoolEvaluation'] = async (
  _parent,
  { id },
  { services, clients, user },
) => {
  if (!user) {
    throw new AppError({
      message: 'Authentication required',
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  }

  const poolResponse = await clients.rwaClient.getPool.post({
    id,
  });

  if (poolResponse.error) {
    throw new AppError({
      message: 'Failed to get pool data',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const pool = poolResponse.data;

  await services.ownership.checkOwnership({
    userId: user.id,
    ownerId: pool.ownerId,
    ownerType: pool.ownerType,
    permission: 'content',
  });

  const response = await clients.aiEvaluatorClient.jobEvaluation.post({
    entityType: 'pool',
    entityId: id,
  });

  if (!response.data || response.error) {
    const error = response.error as { error?: { code?: string; message?: string } };

    if (response.status === 429 || response.status === 409) {
      throw new AppError({
        message: error.error?.message ?? 'Evaluation is not available',
        statusCode: response.status,
        code: error.error?.code ?? 'EVALUATION_UNAVAILABLE',
      });
    }

    throw new AppError({
      message: 'Failed to request pool evaluation',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  return response.data.evaluationId;
};
