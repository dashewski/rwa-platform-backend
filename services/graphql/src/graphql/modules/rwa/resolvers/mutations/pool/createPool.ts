import { AppError } from '@shared/errors/app-errors';
import type { MutationResolvers } from '../../../../../generated/types';

export const createPool: MutationResolvers['createPool'] = async (_parent, { input }, { services, clients, user }) => {
  if (!user) {
    throw new AppError({
      message: 'Authentication required',
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  }

  // Get business first to check permissions
  const businessResponse = await clients.rwaClient.getBusiness.post({
    id: input.businessId,
  });

  if (businessResponse.error) {
    throw new AppError({
      message: 'Failed to get business data',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const business = businessResponse.data;

  if (!business.tokenAddress) {
    throw new AppError({ message: 'Deploy business before', statusCode: 409, code: 'CONFLICT' });
  }

  await services.ownership.checkOwnership({
    userId: user.id,
    ownerId: business.ownerId,
    ownerType: business.ownerType,
    permission: 'content',
  });

  const response = await clients.rwaClient.createPool.post({
    ...input,
    ownerId: business.ownerId,
    ownerType: business.ownerType,
    chainId: business.chainId,
    rwaAddress: business.tokenAddress,
  });

  if (response.error) {
    throw new AppError({ message: 'Failed to create pool', statusCode: 502, code: 'BAD_GATEWAY' });
  }

  const { data } = response;

  return data;
};
