import { AppError } from '@shared/errors/app-errors';
import type { MutationResolvers } from '../../../../generated/types';

export const updatePost: MutationResolvers['updatePost'] = async (_parent, { input }, { services, clients, user }) => {
  if (!user) {
    throw new AppError({
      message: 'Authentication required',
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  }

  // Get post first to check permissions
  const postResponse = await clients.blogClient.getPost.post({
    id: input.id,
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

  const response = await clients.blogClient.updatePost.post({
    id: input.id,
    updateData: input.updateData,
  });

  if (response.error) {
    throw new AppError({ message: 'Failed to update post', statusCode: 502, code: 'BAD_GATEWAY' });
  }

  const { data } = response;

  return data;
};
