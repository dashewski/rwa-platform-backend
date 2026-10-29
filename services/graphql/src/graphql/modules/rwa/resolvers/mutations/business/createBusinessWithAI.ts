import { AppError } from '@shared/errors/app-errors';
import type { MutationResolvers } from '../../../../../generated/types';

export const createBusinessWithAI: MutationResolvers['createBusinessWithAI'] = async (
  _parent,
  { input },
  { services, clients, user },
) => {
  if (!user) {
    throw new AppError({
      message: 'Authentication required',
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  }

  await services.ownership.checkOwnership({
    userId: user.id,
    ownerId: input.ownerId,
    ownerType: input.ownerType,
    permission: 'content',
  });

  const response = await clients.rwaClient.createBusinessWithAI.post({
    description: input.description,
    ownerId: input.ownerId,
    ownerType: input.ownerType,
    chainId: input.chainId,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to create business with AI',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const { data } = response;

  return data;
};
