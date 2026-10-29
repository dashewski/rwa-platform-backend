import { AppError } from '@shared/errors/app-errors';
import type { QueryResolvers } from '../../../../generated/types';

export const getOhlcPriceData: QueryResolvers['getOhlcPriceData'] = async (_parent, { input }, { clients }) => {
  const response = await clients.chartsClient.getOhlcPriceData.post({
    poolAddress: input.poolAddress,
    interval: input.interval as any,
    startTime: input.startTime,
    endTime: input.endTime,
    limit: input.limit,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to get OHLC price data',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const { data } = response;

  return data.map((ohlcData) => ({
    timestamp: ohlcData.timestamp,
    open: ohlcData.open,
    high: ohlcData.high,
    low: ohlcData.low,
    close: ohlcData.close,
  }));
};
