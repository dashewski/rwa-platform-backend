import type { Resolvers } from '../../../generated/types';
import { getSignatureTask } from './queries/getSignatureTask';

export const signersManagerResolvers: Resolvers = {
  Query: {
    getSignatureTask,
  },
};
