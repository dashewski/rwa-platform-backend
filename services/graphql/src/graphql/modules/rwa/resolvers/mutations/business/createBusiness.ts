import { AppError } from '@shared/errors/app-errors';
import type { MutationResolvers } from '../../../../../generated/types';

export const createBusiness: MutationResolvers['createBusiness'] = async (
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

  services.validation.validateCountry(input.country);
  services.validation.validateSocials(input.socials as any);

  await services.ownership.checkOwnership({
    userId: user.id,
    ownerId: input.ownerId,
    ownerType: input.ownerType,
    permission: 'content',
  });

  const response = await clients.rwaClient.createBusiness.post({
    name: input.name,
    ownerId: input.ownerId,
    ownerType: input.ownerType,
    chainId: input.chainId,
    description: input.description,
    tags: input.tags,
    country: input.country ?? undefined,
    businessType: input.businessType ?? undefined,
    socials: input.socials ?? undefined,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to create business',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const { data } = response;

  return data;
};
