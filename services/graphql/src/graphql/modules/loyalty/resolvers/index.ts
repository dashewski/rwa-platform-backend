import type { Resolvers } from '../../../generated/types';
import { getFees } from './queries/getFees';
import { getReferrals } from './queries/getReferrals';
import { getReferrerWithdraws } from './queries/getReferrerWithdraws';
import { getReferrerClaimHistory } from './queries/getReferrerClaimHistory';
import { registerReferral } from './mutations/registerReferral';
import { createReferrerWithdrawTask } from './mutations/createReferrerWithdrawTask';

export const loyaltyResolvers: Resolvers = {
  Query: {
    getFees,
    getReferrals,
    getReferrerWithdraws,
    getReferrerClaimHistory,
  },
  Mutation: {
    registerReferral,
    createReferrerWithdrawTask,
  },
};
