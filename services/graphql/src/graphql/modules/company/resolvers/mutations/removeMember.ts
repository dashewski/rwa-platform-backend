import { AppError } from '@shared/errors/app-errors';
import type { MutationResolvers } from '../../../../generated/types';

export const removeMember: MutationResolvers['removeMember'] = async (
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

  const company = await services.ownership.getCompany({ id: input.companyId });

  // Check if current user is the owner
  if (company.ownerId !== user.id) {
    throw new AppError({
      message: 'Only company owner can remove members',
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  }

  // Check if the member belongs to the company
  const member = company.users.find((u) => u.id === input.id);

  if (!member) {
    throw new AppError({
      message: 'Member does not belong to this company',
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  }

  const response = await clients.companyClient.removeMember.post({
    id: input.id,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to remove member',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  await services.ownership.resetCompanyCache(input.companyId);

  return response.data.id;
};
