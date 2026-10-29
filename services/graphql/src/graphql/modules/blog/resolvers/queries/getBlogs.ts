import { AppError } from '@shared/errors/app-errors';
import type { QueryResolvers } from '../../../../generated/types';

export const getBlogs: QueryResolvers['getBlogs'] = async (_parent, { input }, { clients }) => {
  const response = await clients.blogClient.getBlogs.post({
    filter: input?.filter || {},
    sort: input?.sort || {},
    limit: input?.limit,
    offset: input?.offset,
  });

  if (response.error) {
    throw new AppError({ message: 'Failed to get blogs', statusCode: 502, code: 'BAD_GATEWAY' });
  }

  const { data } = response;

  return data.map((blog) => ({
    id: blog.id,
    name: blog.name,
    ownerId: blog.ownerId,
    ownerType: blog.ownerType,
    creator: blog.creator,
    parentId: blog.parentId,
    grandParentId: blog.grandParentId,
    createdAt: blog.createdAt,
    updatedAt: blog.updatedAt,
  }));
};
