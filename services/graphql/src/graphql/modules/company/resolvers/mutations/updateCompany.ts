import { AppError } from '@shared/errors/app-errors';
import type { MutationResolvers } from '../../../../generated/types';

export const updateCompany: MutationResolvers['updateCompany'] = async (
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

  services.validation.validateCountry(input.updateData.country);
  services.validation.validateSocials(input.updateData.socials as any);

  const company = await services.ownership.getCompany({ id: input.id, });

  // Check if current user is the owner
  if (company.ownerId !== user.id) {
    throw new AppError({
      message: 'Only company owner can update company',
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  }

  const response = await clients.companyClient.updateCompany.post({
    id: input.id,
    updateData: {
      name: input.updateData.name,
      description: input.updateData.description,
      country: input.updateData.country,
      socials: input.updateData.socials,
    },
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to update company',
      statusCode: 502,
      code: 'UPSTREAM_ERROR',
    });
  }

  await services.ownership.resetCompanyCache(input.id);

  const { data } = response;

  return {
    id: data.id,
    name: data.name,
    description: data.description,
    ownerId: data.ownerId,
    country: data.country,
    socials: data.socials ?? [],
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
};
