/**
 * Unit tests for ChartsService.
 *
 * Scope: the service layer, exercising the real ChartEventsClient on top of a
 * fake RedisEventsClient. The price repository is replaced with an in-memory
 * fake (tests/fakes/*.fake.ts), so these tests need no database, no Redis, no
 * broker and no network. Run with `bun test` from services/charts.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { ChartsService, type OhlcInterval } from '../src/services/charts.service';
import { ChartEventsClient } from '../src/clients/redis.client';
import type { PriceDataRepository } from '../src/repositories/priceData.repository';
import type { RedisEventsClient } from '@shared/redis-events/src/redis-events.client';
import { createFakePriceDataRepository, type FakePriceDataRepository } from './fakes/priceData.repository.fake';
import { createFakeRedisEventsClient, type FakeRedisEventsClient } from './fakes/redis-events.client.fake';

const POOL_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

// The event as the scanner publishes it: decoded fields in `data`, the
// envelope (name, chainId, transactionHash, logIndex, blockNumber) on the root.
const PRICE_DATA = {
  chainId: '1',
  name: 'Pool_ReservesUpdated',
  transactionHash: '0xtx1',
  address: POOL_ADDRESS,
  logIndex: 0,
  blockNumber: 12_345,
  timestamp: 1_700_000_000,
  data: {
    emittedFrom: POOL_ADDRESS,
    realHoldReserve: '500',
    virtualHoldReserve: '1000',
    virtualRwaReserve: '4',
  },
};

// Every interval the service accepts, with the seconds it must delegate.
const INTERVAL_SECONDS: Array<[OhlcInterval, number]> = [
  ['1m', 60],
  ['5m', 300],
  ['15m', 900],
  ['30m', 1800],
  ['1h', 3600],
  ['2h', 7200],
  ['4h', 14_400],
  ['6h', 21_600],
  ['12h', 43_200],
  ['1d', 86_400],
  ['1w', 604_800],
];

describe('ChartsService (unit, fake repository + fake redis client)', () => {
  let priceData: FakePriceDataRepository;
  let redis: FakeRedisEventsClient;
  let chartEvents: ChartEventsClient;
  let service: ChartsService;

  beforeEach(() => {
    priceData = createFakePriceDataRepository();
    redis = createFakeRedisEventsClient();
    chartEvents = new ChartEventsClient(redis as unknown as RedisEventsClient);
    service = new ChartsService(priceData as unknown as PriceDataRepository, chartEvents);
  });

  /** Writes a price row straight into the fake repository. */
  async function seedPrice(timestamp: number, price: string, poolAddress = POOL_ADDRESS) {
    return priceData.create({
      poolAddress,
      timestamp,
      blockNumber: 1_000 + timestamp,
      realHoldReserve: '0',
      virtualHoldReserve: '1000',
      virtualRwaReserve: '4',
      price,
    });
  }

  test('recordPriceData: computes the price, stores it and publishes to the pool channel', async () => {
    const result = await service.recordPriceData({ ...PRICE_DATA });

    expect(priceData.create).toHaveBeenCalledTimes(1);
    expect(priceData.create).toHaveBeenCalledWith({
      poolAddress: POOL_ADDRESS,
      timestamp: 1_700_000_000,
      blockNumber: 12_345,
      realHoldReserve: '500',
      virtualHoldReserve: '1000',
      virtualRwaReserve: '4',
      price: '375', // (1000 + 500) / 4 with BigInt arithmetic
    });

    // The update goes to the pool-specific Redis channel as PRICE_UPDATE.
    expect(redis.publish).toHaveBeenCalledTimes(1);
    expect(redis.publish).toHaveBeenCalledWith(`charts:price:${POOL_ADDRESS}`, 'PRICE_UPDATE', {
      poolAddress: POOL_ADDRESS,
      timestamp: 1_700_000_000,
      price: '375',
      realHoldReserve: '500',
      virtualHoldReserve: '1000',
      virtualRwaReserve: '4',
    });

    expect(priceData.store.size).toBe(1);
    expect(result.price).toBe('375');
    expect(result.id).toHaveLength(24); // Mongo ObjectId hex
    expect(typeof result.createdAt).toBe('number');
    expect(result).not.toHaveProperty('_id');
    expect(Object.keys(result).sort()).toEqual([
      'blockNumber',
      'createdAt',
      'id',
      'poolAddress',
      'price',
      'realHoldReserve',
      'timestamp',
      'updatedAt',
      'virtualHoldReserve',
      'virtualRwaReserve',
    ]);
    // The result must be plain JSON - no ObjectId or class instances leaking to the caller.
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  test('recordPriceData: BigInt division truncates the stored price', async () => {
    const result = await service.recordPriceData({
      ...PRICE_DATA,
      data: { ...PRICE_DATA.data, realHoldReserve: '1', virtualHoldReserve: '1000', virtualRwaReserve: '3' },
    });

    expect(result.price).toBe('333'); // 1001 / 3 truncates to 333
    expect(priceData.create).toHaveBeenCalledWith(expect.objectContaining({ price: '333' }));
    expect(redis.publish).toHaveBeenCalledWith(
      `charts:price:${POOL_ADDRESS}`,
      'PRICE_UPDATE',
      expect.objectContaining({ price: '333' }),
    );
  });

  test('recordPriceData: a zero virtualRwaReserve is rejected before any write or publish', async () => {
    await expect(
      service.recordPriceData({ ...PRICE_DATA, data: { ...PRICE_DATA.data, virtualRwaReserve: '0' } }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'virtualRwaReserve cannot be zero for price calculation.',
    });

    expect(priceData.create).toHaveBeenCalledTimes(0);
    expect(redis.publish).toHaveBeenCalledTimes(0);
  });

  test('recordPriceData: propagates a repository failure without publishing', async () => {
    priceData.create.mockRejectedValueOnce(new Error('db unavailable'));

    await expect(service.recordPriceData({ ...PRICE_DATA })).rejects.toThrow('db unavailable');

    expect(redis.publish).toHaveBeenCalledTimes(0);
  });

  test('recordPriceData: publishes after the write, so a publish failure leaves the stored entry', async () => {
    // Current ordering: repository.create runs first, the Redis publish second.
    // A publish failure therefore rejects the call while the entry stays stored.
    redis.publish.mockRejectedValueOnce(new Error('redis unavailable'));

    await expect(service.recordPriceData({ ...PRICE_DATA })).rejects.toThrow('redis unavailable');

    expect(priceData.store.size).toBe(1);
  });

  test('getRawPriceData: forwards the full parameter set and maps every row', async () => {
    const first = await seedPrice(100, '250');
    await seedPrice(200, '260');
    await seedPrice(50, '240'); // outside the requested range

    const result = await service.getRawPriceData({
      poolAddress: POOL_ADDRESS,
      startTime: 100,
      endTime: 250,
      sort: { timestamp: 'desc' },
      limit: 10,
      offset: 1,
    });

    expect(priceData.findByPoolAndTimeRange).toHaveBeenCalledTimes(1);
    expect(priceData.findByPoolAndTimeRange).toHaveBeenCalledWith(POOL_ADDRESS, 100, 250, { timestamp: 'desc' }, 10, 1);

    // Descending order [260, 250], then offset 1 keeps only the older row.
    expect(result).toHaveLength(1);
    expect(result[0].price).toBe('250');
    expect(result[0].id).toBe(first._id.toString());
    expect(result[0]).not.toHaveProperty('_id');
    expect(JSON.parse(JSON.stringify(result[0]))).toEqual(result[0]);
  });

  test('getRawPriceData: passes omitted sort/limit/offset through as undefined', async () => {
    await seedPrice(100, '250');

    const result = await service.getRawPriceData({ poolAddress: POOL_ADDRESS, startTime: 0, endTime: 1000 });

    expect(priceData.findByPoolAndTimeRange).toHaveBeenCalledWith(
      POOL_ADDRESS,
      0,
      1000,
      undefined,
      undefined,
      undefined,
    );
    expect(result).toHaveLength(1);
  });

  test('getRawPriceData: returns an empty array when the range matches nothing', async () => {
    await seedPrice(100, '250');

    const result = await service.getRawPriceData({ poolAddress: POOL_ADDRESS, startTime: 500, endTime: 600 });

    expect(result).toEqual([]);
  });

  test('getRawPriceData: propagates a repository failure', async () => {
    priceData.findByPoolAndTimeRange.mockRejectedValueOnce(new Error('db unavailable'));

    await expect(service.getRawPriceData({ poolAddress: POOL_ADDRESS, startTime: 0, endTime: 1000 })).rejects.toThrow(
      'db unavailable',
    );
  });

  test('getOhlcPriceData: converts every supported interval to seconds before delegating', async () => {
    for (const [interval, seconds] of INTERVAL_SECONDS) {
      priceData.aggregateOhlcData.mockClear();

      await service.getOhlcPriceData({
        poolAddress: POOL_ADDRESS,
        interval,
        startTime: 0,
        endTime: 1_000_000,
        limit: 10,
      });

      expect(priceData.aggregateOhlcData).toHaveBeenCalledTimes(1);
      expect(priceData.aggregateOhlcData).toHaveBeenCalledWith(POOL_ADDRESS, seconds, 0, 1_000_000, 10);
    }
  });

  test('getOhlcPriceData: maps aggregation rows to plain OHLC bars', async () => {
    // The row carries one extra field on purpose: the service must project only
    // the five OHLC fields, never pass the raw aggregation row through.
    priceData.aggregateOhlcData.mockImplementationOnce(async () => [
      { timestamp: 3600, open: '100', high: '250', low: '100', close: '150', _id: 'extra' } as any,
    ]);

    const bars = await service.getOhlcPriceData({
      poolAddress: POOL_ADDRESS,
      interval: '1h',
      startTime: 0,
      endTime: 7200,
    });

    expect(bars).toEqual([{ timestamp: 3600, open: '100', high: '250', low: '100', close: '150' }]);
    expect(Object.keys(bars[0]).sort()).toEqual(['close', 'high', 'low', 'open', 'timestamp']);
    expect(JSON.parse(JSON.stringify(bars))).toEqual(bars);
  });

  test('getOhlcPriceData: an unsupported interval is rejected before the repository runs', async () => {
    await expect(
      service.getOhlcPriceData({
        poolAddress: POOL_ADDRESS,
        interval: '3m' as OhlcInterval,
        startTime: 0,
        endTime: 1000,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Unsupported interval: 3m',
    });

    expect(priceData.aggregateOhlcData).toHaveBeenCalledTimes(0);
  });

  test('getOhlcPriceData: propagates a repository failure', async () => {
    priceData.aggregateOhlcData.mockRejectedValueOnce(new Error('aggregation failed'));

    await expect(
      service.getOhlcPriceData({ poolAddress: POOL_ADDRESS, interval: '1h', startTime: 0, endTime: 1000 }),
    ).rejects.toThrow('aggregation failed');
  });
});
