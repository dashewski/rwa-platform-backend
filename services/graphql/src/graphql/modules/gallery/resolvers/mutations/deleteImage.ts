import { AppError } from '@shared/errors/app-errors';
import type { MutationResolvers } from '../../../../generated/types';

export const deleteImage: MutationResolvers['deleteImage'] = async (_parent, { id }, { services, clients, user }) => {
  if (!user) {
    throw new AppError({
      message: 'Authentication required',
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  }

  // Get image first to check permissions
  const imageResponse = await clients.galleryClient.getImage.post({
    id,
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

  // Delete file from files service
  await clients.filesClient.deleteFile.post({ id: image.fileId });

  const response = await clients.galleryClient.deleteImage.post({
    id,
  });

  if (response.error) {
    throw new AppError({ message: 'Failed to delete image', statusCode: 502, code: 'BAD_GATEWAY' });
  }

  return response.data.id;
};
