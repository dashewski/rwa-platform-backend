import { AppError } from '@shared/errors/app-errors';
import type { QueryResolvers } from '../../../../generated/types';

export const getPost: QueryResolvers['getPost'] = async (_parent, { id }, { clients }) => {
  const response = await clients.blogClient.getPost.post({
    id,
  });

  if (response.error) {
    throw new AppError({ message: 'Failed to get post', statusCode: 502, code: 'BAD_GATEWAY' });
  }

  const post = response.data;

  return post;
};
