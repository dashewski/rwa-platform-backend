import { AppError } from '@shared/errors/app-errors';
import type { MutationResolvers } from '../../../../generated/types';

export const updateBlog: MutationResolvers['updateBlog'] = async (_parent, { input }, { services, clients, user }) => {
  if (!user) {
    throw new AppError({
      message: 'Authentication required',
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  }

  // Get blog first to check permissions
  const blogResponse = await clients.blogClient.getBlog.post({
    id: input.id,
  });

  if (blogResponse.error) {
    throw new AppError({
      message: 'Failed to get blog data',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const blog = blogResponse.data;

  await services.ownership.checkOwnership({
    userId: user.id,
    ownerId: blog.ownerId,
    ownerType: blog.ownerType,
    permission: 'content',
  });

  const response = await clients.blogClient.updateBlog.post({
    id: input.id,
    updateData: input.updateData,
  });

  if (response.error) {
    throw new AppError({ message: 'Failed to update blog', statusCode: 502, code: 'BAD_GATEWAY' });
  }

  const { data } = response;

  return {
    id: data.id,
    name: data.name,
    ownerId: data.ownerId,
    ownerType: data.ownerType,
    creator: data.creator,
    parentId: data.parentId,
    grandParentId: data.grandParentId,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
};
