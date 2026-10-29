import { AppError } from '@shared/errors/app-errors';
import type { MutationResolvers } from '../../../../generated/types';

export const deleteGallery: MutationResolvers['deleteGallery'] = async (
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

  // Get gallery first to check permissions
  const galleryResponse = await clients.galleryClient.getGallery.post({
    id,
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

  const response = await clients.galleryClient.deleteGallery.post({
    id,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to delete gallery',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  return response.data.id;
};
