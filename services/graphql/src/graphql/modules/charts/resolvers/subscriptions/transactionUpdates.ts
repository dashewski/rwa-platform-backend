import type { SubscriptionResolvers } from '../../../../generated/types';
import { pipe, map } from 'graphql-yoga';
import type { RedisEvent } from '../../../../context/types';

export const transactionUpdates: SubscriptionResolvers['transactionUpdates'] = {
  subscribe: (_parent, { poolAddress }, { pubSub }) =>
    pipe(
      pubSub.subscribe(`charts:transactions:${poolAddress}`),
      map((event: RedisEvent) => ({ transactionUpdates: event.payload })),
    ),
};
