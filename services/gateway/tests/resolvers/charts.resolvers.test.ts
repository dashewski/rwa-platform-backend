/**
 * Unit tests for the charts module resolvers (gateway).
 *
 * Queries are plain functions that read { clients } off the GraphQL context and
 * are called directly with the fakes from tests/fakes. Subscription resolvers
 * are { subscribe } objects, so the subscribe side is called with a fake pubSub
 * whose subscribe() yields an in-memory async iterable (mirroring the Redis
 * event target). No network, no database, no Redis, no broker.
 */
import { describe, expect, test } from 'bun:test';
import type { GraphQLContext } from '../../src/graphql/context/types';
import { edenError, edenOk } from '../fakes/clients.fake';
import { createFakeContext } from '../fakes/context.fake';
import { getOhlcPriceData } from '../../src/graphql/modules/charts/resolvers/queries/getOhlcPriceData';
import { getPoolTransactions } from '../../src/graphql/modules/charts/resolvers/queries/getPoolTransactions';
import { getRawPriceData } from '../../src/graphql/modules/charts/resolvers/queries/getRawPriceData';
import { getVolumeData } from '../../src/graphql/modules/charts/resolvers/queries/getVolumeData';
import { priceUpdates } from '../../src/graphql/modules/charts/resolvers/subscriptions/priceUpdates';
import { transactionUpdates } from '../../src/graphql/modules/charts/resolvers/subscriptions/transactionUpdates';

const RAW_PRICE = {
  id: 'price-1',
  poolAddress: '0xpool-1',
  timestamp: 1700000000,
  blockNumber: 123456,
  realHoldReserve: '1000000',
  virtualHoldReserve: '2000000',
  virtualRwaReserve: '3000000',
  price: '1.5',
  createdAt: 1700000000000,
  updatedAt: 1700000001000,
};

const OHLC = {
  timestamp: 1700000000,
  open: '1.0',
  high: '1.6',
  low: '0.9',
  close: '1.5',
};

const VOLUME = {
  timestamp: 1700000000,
  mintVolume: '1000',
  burnVolume: '500',
};

const TRANSACTION = {
  id: 'tx-1',
  poolAddress: '0xpool-1',
  transactionType: 'MINT',
  userAddress: '0xuser-1',
  timestamp: 1700000000,
  rwaAmount: '100',
  holdAmount: '200',
  bonusAmount: '10',
  holdFee: '1',
  bonusFee: '2',
  createdAt: 1700000000000,
  updatedAt: 1700000001000,
};

const PRICE_EVENT = {
  type: 'charts.price',
  payload: {
    poolAddress: '0xpool-1',
    timestamp: 1700000000,
    price: '1.5',
    realHoldReserve: '1000000',
    virtualHoldReserve: '2000000',
    virtualRwaReserve: '3000000',
  },
  metadata: { timestamp: 1700000000, service: 'charts', version: '1' },
};

const TRANSACTION_EVENT = {
  type: 'charts.transaction',
  payload: {
    poolAddress: '0xpool-1',
    timestamp: 1700000001,
    transactionType: 'MINT',
    userAddress: '0xuser-1',
    rwaAmount: '100',
    holdAmount: '200',
    bonusAmount: '10',
    holdFee: '1',
    bonusFee: '2',
  },
  metadata: { timestamp: 1700000001, service: 'charts', version: '1' },
};

/**
 * The generated SubscriptionResolver type is a function | object union, so the
 * tests pick the subscribe side explicitly.
 */
type PoolSubscriber = {
  subscribe: (parent: unknown, args: { poolAddress: string }, ctx: GraphQLContext) => AsyncIterable<unknown>;
};

const subscribeToPriceUpdates = (priceUpdates as unknown as PoolSubscriber).subscribe;
const subscribeToTransactionUpdates = (transactionUpdates as unknown as PoolSubscriber).subscribe;

/** The Redis event target hands resolvers async iterables; the fake pubSub must do the same. */
const asyncIterableOf = <T>(...values: T[]) =>
  (async function* () {
    for (const value of values) yield value;
  })();

describe('gateway charts resolvers (unit, fake clients/services)', () => {
  describe('getRawPriceData', () => {
    test('getRawPriceData: forwards the pool window, pagination and sort', async () => {
      const fake = createFakeContext();
      const input = {
        poolAddress: '0xpool-1',
        startTime: 1700000000,
        endTime: 1700000100,
        limit: 100,
        offset: 5,
        sort: { timestamp: -1 },
      };
      fake.clients.chartsClient.getRawPriceData.post.mockImplementation(async () => edenOk([RAW_PRICE]));

      const result = await getRawPriceData(null as never, { input } as never, fake as unknown as GraphQLContext);

      expect(fake.clients.chartsClient.getRawPriceData.post).toHaveBeenCalledTimes(1);
      expect(fake.clients.chartsClient.getRawPriceData.post).toHaveBeenCalledWith({
        poolAddress: '0xpool-1',
        startTime: 1700000000,
        endTime: 1700000100,
        limit: 100,
        offset: 5,
        sort: { timestamp: -1 },
      });
      expect(result).toEqual([RAW_PRICE]);
    });

    test('getRawPriceData: defaults sort to an empty object', async () => {
      const fake = createFakeContext();
      fake.clients.chartsClient.getRawPriceData.post.mockImplementation(async () => edenOk([]));

      await getRawPriceData(
        null as never,
        { input: { poolAddress: '0xpool-1', startTime: 1, endTime: 2, limit: 10, offset: 0 } } as never,
        fake as unknown as GraphQLContext,
      );

      expect(fake.clients.chartsClient.getRawPriceData.post).toHaveBeenCalledWith({
        poolAddress: '0xpool-1',
        startTime: 1,
        endTime: 2,
        limit: 10,
        offset: 0,
        sort: {},
      });
    });

    test('getRawPriceData: maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext();
      fake.clients.chartsClient.getRawPriceData.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(
        getRawPriceData(
          null as never,
          { input: { poolAddress: '0xpool-1' } } as never,
          fake as unknown as GraphQLContext,
        ),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to get raw price data' });
    });
  });

  describe('getOhlcPriceData', () => {
    test('getOhlcPriceData: forwards the interval and window and maps the candles', async () => {
      const fake = createFakeContext();
      fake.clients.chartsClient.getOhlcPriceData.post.mockImplementation(async () => edenOk([OHLC]));

      const result = await getOhlcPriceData(
        null as never,
        { input: { poolAddress: '0xpool-1', interval: '1h', startTime: 1, endTime: 2, limit: 24 } } as never,
        fake as unknown as GraphQLContext,
      );

      expect(fake.clients.chartsClient.getOhlcPriceData.post).toHaveBeenCalledWith({
        poolAddress: '0xpool-1',
        interval: '1h',
        startTime: 1,
        endTime: 2,
        limit: 24,
      });
      expect(result).toEqual([OHLC]);
    });

    test('getOhlcPriceData: maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext();
      fake.clients.chartsClient.getOhlcPriceData.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(
        getOhlcPriceData(
          null as never,
          { input: { poolAddress: '0xpool-1', interval: '1h' } } as never,
          fake as unknown as GraphQLContext,
        ),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to get OHLC price data' });
    });
  });

  describe('getVolumeData', () => {
    test('getVolumeData: forwards the interval and window and maps the buckets', async () => {
      const fake = createFakeContext();
      fake.clients.chartsClient.getVolumeData.post.mockImplementation(async () => edenOk([VOLUME]));

      const result = await getVolumeData(
        null as never,
        { input: { poolAddress: '0xpool-1', interval: '1d', startTime: 1, endTime: 2, limit: 30 } } as never,
        fake as unknown as GraphQLContext,
      );

      expect(fake.clients.chartsClient.getVolumeData.post).toHaveBeenCalledWith({
        poolAddress: '0xpool-1',
        interval: '1d',
        startTime: 1,
        endTime: 2,
        limit: 30,
      });
      expect(result).toEqual([VOLUME]);
    });

    test('getVolumeData: maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext();
      fake.clients.chartsClient.getVolumeData.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(
        getVolumeData(
          null as never,
          { input: { poolAddress: '0xpool-1', interval: '1d' } } as never,
          fake as unknown as GraphQLContext,
        ),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to get volume data' });
    });
  });

  describe('getPoolTransactions', () => {
    test('getPoolTransactions: forwards filter, sort and pagination', async () => {
      const fake = createFakeContext();
      const input = {
        filter: { poolAddress: '0xpool-1', transactionType: 'MINT' },
        sort: { timestamp: -1 },
        limit: 50,
        offset: 100,
      };
      fake.clients.chartsClient.getPoolTransactions.post.mockImplementation(async () => edenOk([TRANSACTION]));

      const result = await getPoolTransactions(null as never, { input } as never, fake as unknown as GraphQLContext);

      expect(fake.clients.chartsClient.getPoolTransactions.post).toHaveBeenCalledTimes(1);
      expect(fake.clients.chartsClient.getPoolTransactions.post).toHaveBeenCalledWith({
        filter: input.filter,
        sort: input.sort,
        limit: 50,
        offset: 100,
      });
      expect(result).toEqual([TRANSACTION]);
    });

    test('getPoolTransactions: defaults filter and sort to empty objects', async () => {
      const fake = createFakeContext();
      fake.clients.chartsClient.getPoolTransactions.post.mockImplementation(async () => edenOk([]));

      const result = await getPoolTransactions(
        null as never,
        { input: {} } as never,
        fake as unknown as GraphQLContext,
      );

      expect(fake.clients.chartsClient.getPoolTransactions.post).toHaveBeenCalledWith({
        filter: {},
        sort: {},
        limit: undefined,
        offset: undefined,
      });
      expect(result).toEqual([]);
    });

    test('getPoolTransactions: maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext();
      fake.clients.chartsClient.getPoolTransactions.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(
        getPoolTransactions(null as never, { input: { limit: 10 } } as never, fake as unknown as GraphQLContext),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to get pool transactions' });
    });
  });

  describe('subscriptions', () => {
    describe('priceUpdates', () => {
      test('priceUpdates: subscribes to the charts price channel of the pool and wraps the payload', async () => {
        const fake = createFakeContext();
        fake.pubSub.subscribe.mockImplementation((() => asyncIterableOf(PRICE_EVENT)) as never);

        const stream = subscribeToPriceUpdates(null, { poolAddress: '0xpool-1' }, fake as unknown as GraphQLContext);

        expect(fake.pubSub.subscribe).toHaveBeenCalledTimes(1);
        expect(fake.pubSub.subscribe).toHaveBeenCalledWith('charts:price:0xpool-1');

        const first = await stream[Symbol.asyncIterator]().next();
        expect(first.value).toEqual({ priceUpdates: PRICE_EVENT.payload });
      });

      test('priceUpdates: builds a distinct channel for every pool address', async () => {
        const fake = createFakeContext();
        const event = { ...PRICE_EVENT, payload: { ...PRICE_EVENT.payload, poolAddress: '0xpool-2' } };
        fake.pubSub.subscribe.mockImplementation((() => asyncIterableOf(event)) as never);

        const stream = subscribeToPriceUpdates(null, { poolAddress: '0xpool-2' }, fake as unknown as GraphQLContext);

        expect(fake.pubSub.subscribe).toHaveBeenCalledWith('charts:price:0xpool-2');

        const first = await stream[Symbol.asyncIterator]().next();
        expect(first.value).toEqual({ priceUpdates: event.payload });
      });
    });

    describe('transactionUpdates', () => {
      test('transactionUpdates: subscribes to the charts transactions channel and wraps the payload', async () => {
        const fake = createFakeContext();
        fake.pubSub.subscribe.mockImplementation((() => asyncIterableOf(TRANSACTION_EVENT)) as never);

        const stream = subscribeToTransactionUpdates(
          null,
          { poolAddress: '0xpool-1' },
          fake as unknown as GraphQLContext,
        );

        expect(fake.pubSub.subscribe).toHaveBeenCalledTimes(1);
        expect(fake.pubSub.subscribe).toHaveBeenCalledWith('charts:transactions:0xpool-1');

        const first = await stream[Symbol.asyncIterator]().next();
        expect(first.value).toEqual({ transactionUpdates: TRANSACTION_EVENT.payload });
      });

      test('transactionUpdates: builds a distinct channel for every pool address', async () => {
        const fake = createFakeContext();
        const event = { ...TRANSACTION_EVENT, payload: { ...TRANSACTION_EVENT.payload, poolAddress: '0xpool-2' } };
        fake.pubSub.subscribe.mockImplementation((() => asyncIterableOf(event)) as never);

        const stream = subscribeToTransactionUpdates(
          null,
          { poolAddress: '0xpool-2' },
          fake as unknown as GraphQLContext,
        );

        expect(fake.pubSub.subscribe).toHaveBeenCalledWith('charts:transactions:0xpool-2');

        const first = await stream[Symbol.asyncIterator]().next();
        expect(first.value).toEqual({ transactionUpdates: event.payload });
      });
    });
  });
});
