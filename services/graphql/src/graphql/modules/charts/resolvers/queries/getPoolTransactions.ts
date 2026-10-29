import { AppError } from '@shared/errors/app-errors';
import type { QueryResolvers } from '../../../../generated/types';

export const getPoolTransactions: QueryResolvers['getPoolTransactions'] = async (_parent, { input }, { clients }) => {
  const response = await clients.chartsClient.getPoolTransactions.post({
    filter: input?.filter || {},
    sort: input?.sort || {},
    limit: input?.limit,
    offset: input?.offset,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to get pool transactions',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const { data } = response;

  return data.map((tx) => ({
    id: tx.id,
    poolAddress: tx.poolAddress,
    transactionType: tx.transactionType,
    userAddress: tx.userAddress,
    timestamp: tx.timestamp,
    rwaAmount: tx.rwaAmount,
    holdAmount: tx.holdAmount,
    bonusAmount: tx.bonusAmount,
    holdFee: tx.holdFee,
    bonusFee: tx.bonusFee,
    createdAt: tx.createdAt,
    updatedAt: tx.updatedAt,
  }));
};
