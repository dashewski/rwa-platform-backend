import type { Resolvers } from '../../../generated/types';
import { getHistory } from './queries/getHistory';
import { getUnlockTime } from './queries/getUnlockTime';
import { requestGas } from './mutations/requestGas';
import { requestHold } from './mutations/requestHold';
import { requestPlatform } from './mutations/requestPlatform';

export const testnetFaucetResolvers: Resolvers = {
  Query: {
    getHistory,
    getUnlockTime,
  },
  Mutation: {
    requestGas,
    requestHold,
    requestPlatform,
  },
};
