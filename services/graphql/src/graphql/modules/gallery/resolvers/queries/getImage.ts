import { AppError } from '@shared/errors/app-errors';
import type { QueryResolvers } from '../../../../generated/types';

export const getImage: QueryResolvers['getImage'] = async (_parent, { id }, { clients }) => {
  const response = await clients.galleryClient.getImage.post({
    id,
  });

  if (response.error) {
    throw new AppError({ message: 'Failed to get image', statusCode: 502, code: 'BAD_GATEWAY' });
  }

  const image = response.data;

  return {
    id: image.id,
    galleryId: image.galleryId,
    name: image.name,
    description: image.description,
    fileId: image.fileId,
    path: image.path,
    url: image.url,
    mimeType: image.mimeType,
    size: image.size,
    ownerId: image.ownerId,
    ownerType: image.ownerType,
    creator: image.creator,
    parentId: image.parentId,
    grandParentId: image.grandParentId,
    createdAt: image.createdAt,
    updatedAt: image.updatedAt,
  };
};
