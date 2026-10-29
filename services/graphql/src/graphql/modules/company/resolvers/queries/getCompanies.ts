import { AppError } from '@shared/errors/app-errors';
import type { QueryResolvers } from '../../../../generated/types';

export const getCompanies: QueryResolvers['getCompanies'] = async (_parent, { input }, { clients }) => {
  const response = await clients.companyClient.getCompanies.post({
    filter: input?.filter || {},
    sort: input?.sort,
    limit: input?.limit,
    offset: input?.offset,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to get companies',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const { data } = response;

  return data;
};
