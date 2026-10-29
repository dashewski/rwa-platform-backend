import { AppError } from '@shared/errors/app-errors';
import type { QueryResolvers } from '../../../../generated/types';

export const getEntityReactions: QueryResolvers['getEntityReactions'] = async (
  _parent,
  { parentId, parentType },
  { clients, user },
) => {
  const response = await clients.reactionsClient.getEntityReactions.post({
    parentId,
    parentType,
    userId: user?.id,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to get entity reactions',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const { data } = response;

  return data;
};
