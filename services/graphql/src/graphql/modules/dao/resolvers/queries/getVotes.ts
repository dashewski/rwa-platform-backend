import { AppError } from '@shared/errors/app-errors';
import type { QueryResolvers } from '../../../../generated/types';

export const getVotes: QueryResolvers['getVotes'] = async (_parent, { input }, { clients }) => {
  const response = await clients.daoClient.getVotes.post({
    filter: input?.filter || {},
    sort: input?.sort || {},
    limit: input?.limit,
    offset: input?.offset,
  });

  if (response.error) {
    throw new AppError({ message: 'Failed to get votes', statusCode: 502, code: 'BAD_GATEWAY' });
  }

  const { data } = response;

  return data;
};
