import { AppError } from '@shared/errors/app-errors';
import type { MutationResolvers } from '../../../../../generated/types';

export const rejectBusinessApprovalSignatures: MutationResolvers['rejectBusinessApprovalSignatures'] = async (
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

  const response = await clients.rwaClient.rejectBusinessApprovalSignatures.post({
    id,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to reject business approval signatures',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  return true;
};
