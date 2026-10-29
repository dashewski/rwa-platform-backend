import { AppError } from '@shared/errors/app-errors';
import type { MutationResolvers } from '../../../../generated/types';

export const createPost: MutationResolvers['createPost'] = async (_parent, { input }, { services, clients, user }) => {
  if (!user) {
    throw new AppError({
      message: 'Authentication required',
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  }

  const blogResponse = await clients.blogClient.getBlog.post({
    id: input.blogId,
  });

  if (blogResponse.error) {
    throw new AppError({ message: 'Failed to get blog', statusCode: 502, code: 'BAD_GATEWAY' });
  }

  const blog = blogResponse.data;

  await services.ownership.checkOwnership({
    userId: user.id,
    ownerId: blog.ownerId,
    ownerType: blog.ownerType,
    permission: 'content',
  });

  const response = await clients.blogClient.createPost.post({
    title: input.title,
    content: input.content,
    images: input.images,
    documents: input.documents,
    ownerId: blog.ownerId,
    ownerType: blog.ownerType,
    creator: user.id,
    parentId: blog.parentId,
    grandParentId: blog.grandParentId,
    blogId: blog.id,
  });

  if (response.error) {
    throw new AppError({ message: 'Failed to create post', statusCode: 502, code: 'BAD_GATEWAY' });
  }

  const { data } = response;

  return data;
};
