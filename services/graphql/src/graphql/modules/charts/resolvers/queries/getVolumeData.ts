import { AppError } from '@shared/errors/app-errors';
import type { QueryResolvers } from '../../../../generated/types';

export const getVolumeData: QueryResolvers['getVolumeData'] = async (_parent, { input }, { clients }) => {
  const response = await clients.chartsClient.getVolumeData.post({
    poolAddress: input.poolAddress,
    interval: input.interval as any,
    startTime: input.startTime,
    endTime: input.endTime,
    limit: input.limit,
  });

  if (response.error) {
    throw new AppError({
      message: 'Failed to get volume data',
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const { data } = response;

  return data.map((volumeData) => ({
    timestamp: volumeData.timestamp,
    mintVolume: volumeData.mintVolume,
    burnVolume: volumeData.burnVolume,
  }));
};
