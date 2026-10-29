import { AppError } from '@shared/errors/app-errors';
import type { QueryResolvers } from '../../../../generated/types';

export const getGalleries: QueryResolvers['getGalleries'] = async (_parent, { input }, { clients }) => {
  const response = await clients.galleryClient.getGalleries.post({
    filter: input?.filter || {},
    sort: input?.sort || {},
    limit: input?.limit,
    offset: input?.offset,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to get galleries',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const { data } = response;

  return data.map((gallery) => ({
    id: gallery.id,
    name: gallery.name,
    parentId: gallery.parentId,
    ownerId: gallery.ownerId,
    ownerType: gallery.ownerType,
    creator: gallery.creator,
    grandParentId: gallery.grandParentId,
    createdAt: gallery.createdAt,
    updatedAt: gallery.updatedAt,
  }));
};
