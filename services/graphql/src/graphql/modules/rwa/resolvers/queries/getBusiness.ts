import { AppError } from '@shared/errors/app-errors';
import type { QueryResolvers } from '../../../../generated/types';

export const getBusiness: QueryResolvers['getBusiness'] = async (_parent, { id }, { clients }) => {
  const response = await clients.rwaClient.getBusiness.post({
    id,
  });

  if (response.error) {
    throw new AppError({ message: 'Failed to get business', statusCode: 502, code: 'BAD_GATEWAY' });
  }

  return response.data;
};
