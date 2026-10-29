import { AppError } from '@shared/errors/app-errors';
import type { MutationResolvers } from '../../../../generated/types';

export const deleteBlog: MutationResolvers['deleteBlog'] = async (_parent, { id }, { services, clients, user }) => {
  if (!user) {
    throw new AppError({
      message: 'Authentication required',
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  }

  // Get blog first to check permissions
  const blogResponse = await clients.blogClient.getBlog.post({
    id,
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

  const response = await clients.blogClient.deleteBlog.post({
    id,
  });

  if (response.error) {
    throw new AppError({ message: 'Failed to delete blog', statusCode: 502, code: 'BAD_GATEWAY' });
  }

  return response.data.id;
};
