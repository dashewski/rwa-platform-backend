import { createPubSub } from 'graphql-yoga';
import { createRedisEventTarget } from '@graphql-yoga/redis-event-target';
import { CONFIG } from '../config';

import { RedisWithTracing } from '@shared/monitoring/src/redis';

const publishClient = new RedisWithTracing(CONFIG.REDIS.URL);
const subscribeClient = new RedisWithTracing(CONFIG.REDIS.URL);

export interface PriceUpdatePayload {
  poolAddress: string;
  timestamp: number;
  price: string;
  realHoldReserve: string;
  virtualHoldReserve: string;
  virtualRwaReserve: string;
}

export interface TransactionUpdatePayload {
  poolAddress: string;
  timestamp: number;
  transactionType: string;
  userAddress: string;
  rwaAmount: string;
  holdAmount: string;
  bonusAmount: string;
  holdFee: string;
  bonusFee: string;
}

export type PubSubPayloads = Record<string, [any]> & {
  [topic: `charts:price:${string}`]: [PriceUpdatePayload];
  [topic: `charts:transactions:${string}`]: [TransactionUpdatePayload];
  'pool:deployed': [{ payload: unknown }];
};

export const pubSub = createPubSub<PubSubPayloads>({
  eventTarget: createRedisEventTarget({
    publishClient,
    subscribeClient,
  }),
});
