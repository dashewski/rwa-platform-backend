import { AppError } from '@shared/errors/app-errors';
import type { MutationResolvers } from '../../../../generated/types';

export const updateBusinessRiskScore: MutationResolvers['updateBusinessRiskScore'] = async (
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

  const businessResponse = await clients.rwaClient.getBusiness.post({
    id,
  });

  if (businessResponse.error) {
    throw new AppError({
      message: 'Failed to get business data',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const business = businessResponse.data;

  await services.ownership.checkOwnership({
    userId: user.id,
    ownerId: business.ownerId,
    ownerType: business.ownerType,
    permission: 'content',
  });

  if (!business.tokenAddress) {
    throw new AppError({
      message: 'Business is not deployed yet',
      statusCode: 409,
      code: 'NOT_DEPLOYED',
    });
  }

  const response = await clients.aiEvaluatorClient.evaluate.post({
    entityType: 'business',
    entityId: id,
    ownerId: business.ownerId,
    ownerType: business.ownerType,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to request business evaluation',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  return response.data.evaluationId;
};
