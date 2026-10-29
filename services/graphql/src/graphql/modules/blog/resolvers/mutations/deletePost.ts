import { AppError } from '@shared/errors/app-errors';
import type { MutationResolvers } from '../../../../generated/types';

export const deletePost: MutationResolvers['deletePost'] = async (_parent, { id }, { services, clients, user }) => {
  if (!user) {
    throw new AppError({
      message: 'Authentication required',
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  }

  // Get post first to check permissions
  const postResponse = await clients.blogClient.getPost.post({
    id,
  });

  if (postResponse.error) {
    throw new AppError({
      message: 'Failed to get post data',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const post = postResponse.data;

  await services.ownership.checkOwnership({
    userId: user.id,
    ownerId: post.ownerId,
    ownerType: post.ownerType,
    permission: 'content',
  });

  const response = await clients.blogClient.deletePost.post({
    id,
  });

  if (response.error) {
    throw new AppError({ message: 'Failed to delete post', statusCode: 502, code: 'BAD_GATEWAY' });
  }

  return response.data.id;
};
