import { AppError } from '@shared/errors/app-errors';
import type { MutationResolvers } from '../../../../generated/types';

export const updateImage: MutationResolvers['updateImage'] = async (
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

  // Get image first to check permissions
  const imageResponse = await clients.galleryClient.getImage.post({
    id: input.id,
  });

  if (imageResponse.error) {
    throw new AppError({
      message: 'Failed to get image data',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const image = imageResponse.data;

  await services.ownership.checkOwnership({
    userId: user.id,
    ownerId: image.ownerId,
    ownerType: image.ownerType,
    permission: 'content',
  });

  const response = await clients.galleryClient.updateImage.post({
    id: input.id,
    updateData: input.updateData,
  });

  if (response.error) {
    throw new AppError({ message: 'Failed to update image', statusCode: 502, code: 'BAD_GATEWAY' });
  }

  const { data } = response;

  return {
    id: data.id,
    galleryId: data.galleryId,
    name: data.name,
    description: data.description,
    fileId: data.fileId,
    path: data.path,
    url: data.url,
    mimeType: data.mimeType,
    size: data.size,
    ownerId: data.ownerId,
    ownerType: data.ownerType,
    creator: data.creator,
    parentId: data.parentId,
    grandParentId: data.grandParentId,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
};
