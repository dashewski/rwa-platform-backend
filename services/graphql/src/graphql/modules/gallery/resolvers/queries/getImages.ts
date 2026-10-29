import { AppError } from '@shared/errors/app-errors';
import type { QueryResolvers } from '../../../../generated/types';

export const getImages: QueryResolvers['getImages'] = async (_parent, { input }, { clients }) => {
  const response = await clients.galleryClient.getImages.post({
    filter: input?.filter || {},
    sort: input?.sort || {},
    limit: input?.limit,
    offset: input?.offset,
  });

  if (response.error) {
    throw new AppError({ message: 'Failed to get images', statusCode: 502, code: 'BAD_GATEWAY' });
  }

  const { data } = response;

  return data.map((image) => ({
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
  }));
};
