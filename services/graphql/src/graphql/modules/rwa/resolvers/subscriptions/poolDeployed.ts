import type { SubscriptionResolvers } from '../../../../generated/types';
import { pipe, map } from 'graphql-yoga';
import type { RedisEvent } from '../../../../context/types';

export const poolDeployed: SubscriptionResolvers['poolDeployed'] = {
  subscribe: (_parent, _args, { pubSub }) =>
    pipe(
      pubSub.subscribe('pool:deployed'),
      map((event: RedisEvent) => ({ poolDeployed: event.payload })),
    ),
};
