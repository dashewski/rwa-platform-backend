import { AppError } from '@shared/errors/app-errors';
import type { MutationResolvers } from '../../../../generated/types';

export const updateGallery: MutationResolvers['updateGallery'] = async (
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

  // Get gallery first to check permissions
  const galleryResponse = await clients.galleryClient.getGallery.post({
    id: input.id,
  });

  if (galleryResponse.error) {
    throw new AppError({
      message: 'Failed to get gallery data',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const gallery = galleryResponse.data;

  await services.ownership.checkOwnership({
    userId: user.id,
    ownerId: gallery.ownerId,
    ownerType: gallery.ownerType,
    permission: 'content',
  });

  const response = await clients.galleryClient.updateGallery.post({
    id: input.id,
    updateData: input.updateData,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to update gallery',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const { data } = response;

  return {
    id: data.id,
    name: data.name,
    parentId: data.parentId,
    ownerId: data.ownerId,
    ownerType: data.ownerType,
    creator: data.creator,
    grandParentId: data.grandParentId,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
};
