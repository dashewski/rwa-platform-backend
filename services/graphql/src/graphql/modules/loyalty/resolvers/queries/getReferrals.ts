import { AppError } from '@shared/errors/app-errors';
import type { QueryResolvers } from '../../../../generated/types';

export const getReferrals: QueryResolvers['getReferrals'] = async (_parent, { input }, { clients }) => {
  const response = await clients.loyaltyClient.getReferrals.post({
    filter: input?.filter || {},
    sort: input?.sort || {},
    limit: input?.limit,
    offset: input?.offset,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to get referrals',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const { data } = response;

  return data;
};
