import type { Resolvers } from '../../../generated/types';
import { getProposals } from './queries/getProposals';
import { getStaking } from './queries/getStaking';
import { getStakingHistory } from './queries/getStakingHistory';
import { getTimelockTasks } from './queries/getTimelockTasks';
import { getTreasuryWithdraws } from './queries/getTreasuryWithdraws';
import { getVotes } from './queries/getVotes';

export const daoResolvers: Resolvers = {
  Query: {
    getProposals,
    getStaking,
    getStakingHistory,
    getTimelockTasks,
    getTreasuryWithdraws,
    getVotes,
  },
  Mutation: {},
};
