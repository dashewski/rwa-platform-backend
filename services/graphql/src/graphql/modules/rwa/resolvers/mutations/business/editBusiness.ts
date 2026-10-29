import { AppError } from '@shared/errors/app-errors';
import type { MutationResolvers } from '../../../../../generated/types';

export const editBusiness: MutationResolvers['editBusiness'] = async (
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
    permission: 'content',
  });

  const response = await clients.rwaClient.editBusiness.post({
    id: input.id,
    updateData: {
      chainId: input.updateData.chainId,
      name: input.updateData.name,
      description: input.updateData.description,
      tags: input.updateData.tags,
      country: input.updateData.country,
      businessType: input.updateData.businessType,
      socials: input.updateData.socials,
    },
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to edit business',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const { data } = response;

  return data;
};
