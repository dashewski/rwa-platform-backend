import type { Resolvers } from '../../../generated/types';
import { getBalances } from './queries/getBalances';
import { getTransactions } from './queries/getTransactions';

export const portfolioResolvers: Resolvers = {
  Query: {
    getBalances,
    getTransactions,
  },
};
