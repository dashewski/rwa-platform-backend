import type { Resolvers } from '../../../generated/types';
import { getEntityReactions } from './queries/getEntityReactions';
import { getReactions } from './queries/getReactions';
import { setReaction } from './mutations/setReaction';
import { resetReaction } from './mutations/resetReaction';

export const reactionsResolvers: Resolvers = {
  Query: {
    getEntityReactions,
    getReactions,
  },
  Mutation: {
    setReaction,
    resetReaction,
  },
};
