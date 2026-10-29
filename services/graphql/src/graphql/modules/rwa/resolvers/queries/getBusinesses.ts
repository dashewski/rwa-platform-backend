import { AppError } from '@shared/errors/app-errors';
import type { QueryResolvers } from '../../../../generated/types';

export const getBusinesses: QueryResolvers['getBusinesses'] = async (_parent, { input }, { clients }) => {
  const response = await clients.rwaClient.getBusinesses.post({
    filter: input.filter,
    sort: input.sort,
    limit: input.limit,
    offset: input.offset,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to get businesses',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  return response.data;
};
