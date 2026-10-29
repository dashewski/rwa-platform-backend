import { AppError } from '@shared/errors/app-errors';
import type { MutationResolvers } from '../../../../generated/types';

export const revokePermission: MutationResolvers['revokePermission'] = async (
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
      message: 'Only company owner can revoke permissions',
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  }

  // Check if the permission belongs to the company
  const belongs = company.users.some((u) => u.permissions.some((p) => p.id === input.id));

  if (!belongs) {
    throw new AppError({
      message: 'Permission does not belong to this company',
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  }

  const response = await clients.companyClient.revokePermission.post({
    id: input.id,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to revoke permission',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  await services.ownership.resetCompanyCache(input.companyId);

  return response.data.id;
};
