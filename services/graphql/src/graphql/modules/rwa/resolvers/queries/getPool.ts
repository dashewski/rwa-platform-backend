import { AppError } from '@shared/errors/app-errors';
import type { QueryResolvers } from '../../../../generated/types';

export const getPool: QueryResolvers['getPool'] = async (_parent, { id }, { clients }) => {
  const response = await clients.rwaClient.getPool.post({
    id,
  });

  if (response.error) {
    throw new AppError({ message: 'Failed to get pool', statusCode: 502, code: 'BAD_GATEWAY' });
  }

  const pool = response.data;

  return pool;
};
