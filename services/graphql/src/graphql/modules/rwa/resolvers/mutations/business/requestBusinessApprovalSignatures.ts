import { AppError } from '@shared/errors/app-errors';
import type { MutationResolvers } from '../../../../../generated/types';

export const requestBusinessApprovalSignatures: MutationResolvers['requestBusinessApprovalSignatures'] = async (
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

  // Get business first to check permissions
  const businessResponse = await clients.rwaClient.getBusiness.post({
    id: input.id,
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
    permission: 'deploy',
  });

  // Wallet inputs are deprecated and ignored: the owner wallet is derived from the entity owner,
  // the deployer is the authenticated user.
  const ownerWallet = await services.ownership.getOwnerWallet({
    user,
    ownerId: business.ownerId,
    ownerType: business.ownerType,
  });

  const response = await clients.rwaClient.requestBusinessApprovalSignatures.post({
    id: input.id,
    ownerWallet,
    deployerWallet: user.wallet,
    createRWAFee: input.createRWAFee,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to request business approval signatures',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const { data } = response;

  return data;
};
