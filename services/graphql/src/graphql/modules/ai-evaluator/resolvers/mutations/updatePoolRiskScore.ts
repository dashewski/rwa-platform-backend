import { AppError } from '@shared/errors/app-errors';
import type { MutationResolvers } from '../../../../generated/types';

export const updatePoolRiskScore: MutationResolvers['updatePoolRiskScore'] = async (
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

  if (!pool.poolAddress) {
    throw new AppError({
      message: 'Pool is not deployed yet',
      statusCode: 409,
      code: 'NOT_DEPLOYED',
    });
  }

  const response = await clients.aiEvaluatorClient.evaluate.post({
    entityType: 'pool',
    entityId: id,
    ownerId: pool.ownerId,
    ownerType: pool.ownerType,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to request pool evaluation',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  return response.data.evaluationId;
};
