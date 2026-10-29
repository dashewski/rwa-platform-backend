import { AppError } from '@shared/errors/app-errors';
import type { QueryResolvers } from '../../../../generated/types';

export const getRawPriceData: QueryResolvers['getRawPriceData'] = async (_parent, { input }, { clients }) => {
  const response = await clients.chartsClient.getRawPriceData.post({
    poolAddress: input.poolAddress,
    startTime: input.startTime,
    endTime: input.endTime,
    limit: input.limit,
    offset: input.offset,
    sort: input.sort || {},
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to get raw price data',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const { data } = response;

  return data.map((priceData) => ({
    id: priceData.id,
    poolAddress: priceData.poolAddress,
    timestamp: priceData.timestamp,
    blockNumber: priceData.blockNumber,
    realHoldReserve: priceData.realHoldReserve,
    virtualHoldReserve: priceData.virtualHoldReserve,
    virtualRwaReserve: priceData.virtualRwaReserve,
    price: priceData.price,
    createdAt: priceData.createdAt,
    updatedAt: priceData.updatedAt,
  }));
};
