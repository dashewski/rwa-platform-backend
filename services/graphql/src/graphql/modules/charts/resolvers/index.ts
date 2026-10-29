import type { Resolvers } from '../../../generated/types';
import { getRawPriceData } from './queries/getRawPriceData';
import { getOhlcPriceData } from './queries/getOhlcPriceData';
import { getPoolTransactions } from './queries/getPoolTransactions';
import { getVolumeData } from './queries/getVolumeData';
import { priceUpdates } from './subscriptions/priceUpdates';
import { transactionUpdates } from './subscriptions/transactionUpdates';

export const chartsResolvers: Resolvers = {
  Query: {
    getRawPriceData,
    getOhlcPriceData,
    getPoolTransactions,
    getVolumeData,
  },
  Subscription: {
    priceUpdates,
    transactionUpdates,
  },
};
