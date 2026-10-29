import { AppError } from '@shared/errors/app-errors';
import type { QueryResolvers } from '../../../../generated/types';

export const getBlog: QueryResolvers['getBlog'] = async (_parent, { id }, { clients }) => {
  const response = await clients.blogClient.getBlog.post({
    id,
  });

  if (response.error) {
    throw new AppError({ message: 'Failed to get blog', statusCode: 502, code: 'BAD_GATEWAY' });
  }

  const blog = response.data;

  return {
    id: blog.id,
    name: blog.name,
    ownerId: blog.ownerId,
    ownerType: blog.ownerType,
    creator: blog.creator,
    parentId: blog.parentId,
    grandParentId: blog.grandParentId,
    createdAt: blog.createdAt,
    updatedAt: blog.updatedAt,
  };
};
