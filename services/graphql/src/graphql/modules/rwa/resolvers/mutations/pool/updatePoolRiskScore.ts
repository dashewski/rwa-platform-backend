import { AppError } from '@shared/errors/app-errors';
import type { MutationResolvers } from '../../../../../generated/types';

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

  const response = await clients.rwaClient.requestPoolEvaluation.post({
    id,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to request pool evaluation',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  return response.data;
};
