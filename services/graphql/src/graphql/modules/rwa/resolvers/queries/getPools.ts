import { AppError } from '@shared/errors/app-errors';
import type { QueryResolvers } from '../../../../generated/types';

export const getPools: QueryResolvers['getPools'] = async (_parent, { input }, { clients }) => {
  const response = await clients.rwaClient.getPools.post({
    filter: input.filter,
    sort: input.sort,
    limit: input.limit,
    offset: input.offset,
  });

  if (response.error) {
    throw new AppError({ message: 'Failed to get pools', statusCode: 502, code: 'BAD_GATEWAY' });
  }

  return response.data;
};
