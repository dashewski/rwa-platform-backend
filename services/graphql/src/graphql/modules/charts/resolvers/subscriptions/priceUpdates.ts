import type { SubscriptionResolvers } from '../../../../generated/types';
import { pipe, map } from 'graphql-yoga';
import type { RedisEvent } from '../../../../context/types';

export const priceUpdates: SubscriptionResolvers['priceUpdates'] = {
  subscribe: (_parent, { poolAddress }, { pubSub }) =>
    pipe(
      pubSub.subscribe(`charts:price:${poolAddress}`),
      map((event: RedisEvent) => ({ priceUpdates: event.payload })),
    ),
};
