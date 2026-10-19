/**
 * Unit tests for TransactionsService.
 *
 * Scope: the service layer, exercising the real ChartEventsClient on top of a
 * fake RedisEventsClient. The transaction repository is replaced with an
 * in-memory fake (tests/fakes/*.fake.ts), so these tests need no database, no
 * Redis, no broker and no network. Run with `bun test` from services/charts.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { TransactionsService } from '../src/services/transactions.service';
import { ChartEventsClient } from '../src/clients/redis.client';
import { PoolTransactionType } from '../src/models/shared/enums.model';
import type { PoolTransactionRepository } from '../src/repositories/poolTransaction.repository';
import type { RedisEventsClient } from '@shared/redis-events/src/redis-events.client';
import {
  createFakePoolTransactionRepository,
  type CreatePoolTransactionInput,
  type FakePoolTransactionRepository,
} from './fakes/poolTransaction.repository.fake';
import { createFakeRedisEventsClient, type FakeRedisEventsClient } from './fakes/redis-events.client.fake';

const POOL_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USER_ADDRESS = '0x1234567890AbcdEF1234567890aBcdef12345678';

// The events as the scanner publishes them: decoded fields in `data`, the
// envelope (name, chainId, transactionHash, logIndex, blockNumber) on the root.
const MINT_EVENT = {
  chainId: '1',
  name: 'Pool_RwaMinted',
  transactionHash: '0xtx1',
  address: POOL_ADDRESS,
  logIndex: 0,
  blockNumber: 12_345,
  timestamp: 1_700_000_000,
  data: {
    emittedFrom: POOL_ADDRESS,
    minter: USER_ADDRESS,
    rwaAmountMinted: '1000',
    holdAmountPaid: '1000',
    feePaid: '5',
  },
};

const BURN_EVENT = {
  chainId: '1',
  name: 'Pool_RwaBurned',
  transactionHash: '0xtx2',
  address: POOL_ADDRESS,
  logIndex: 1,
  blockNumber: 12_346,
  timestamp: 1_700_000_100,
  data: {
    emittedFrom: POOL_ADDRESS,
    burner: USER_ADDRESS,
    rwaAmountBurned: '1000',
    holdAmountReceived: '1000',
    bonusAmountReceived: '100',
    holdFeePaid: '5',
    bonusFeePaid: '3',
  },
};

// Every interval the service accepts, with the seconds it must delegate.
const INTERVAL_SECONDS: Array<[string, number]> = [
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

describe('TransactionsService (unit, fake repository + fake redis client)', () => {
  let poolTransactions: FakePoolTransactionRepository;
  let redis: FakeRedisEventsClient;
  let chartEvents: ChartEventsClient;
  let service: TransactionsService;

  beforeEach(() => {
    poolTransactions = createFakePoolTransactionRepository();
    redis = createFakeRedisEventsClient();
    chartEvents = new ChartEventsClient(redis as unknown as RedisEventsClient);
    service = new TransactionsService(poolTransactions as unknown as PoolTransactionRepository, chartEvents);
  });

  /** Writes a transaction row straight into the fake repository. */
  async function seedTransaction(overrides: Partial<CreatePoolTransactionInput> = {}) {
    return poolTransactions.create({
      poolAddress: POOL_ADDRESS,
      transactionType: PoolTransactionType.MINT,
      userAddress: USER_ADDRESS,
      timestamp: 100,
      rwaAmount: '100',
      holdAmount: '100',
      holdFee: '5',
      ...overrides,
    });
  }

  test('recordMint: defaults both bonus fields to "0" and publishes the update', async () => {
    const result = await service.recordMint({ ...MINT_EVENT });

    expect(poolTransactions.create).toHaveBeenCalledTimes(1);
    expect(poolTransactions.create).toHaveBeenCalledWith({
      poolAddress: POOL_ADDRESS,
      transactionType: PoolTransactionType.MINT,
      userAddress: USER_ADDRESS,
      timestamp: 1_700_000_000,
      rwaAmount: '1000',
      holdAmount: '1000',
      holdFee: '5',
      bonusAmount: '0',
      bonusFee: '0',
    });

    // The update goes to the pool-specific Redis channel as TRANSACTION_UPDATE.
    expect(redis.publish).toHaveBeenCalledTimes(1);
    expect(redis.publish).toHaveBeenCalledWith(`charts:transactions:${POOL_ADDRESS}`, 'TRANSACTION_UPDATE', {
      poolAddress: POOL_ADDRESS,
      timestamp: 1_700_000_000,
      transactionType: 'MINT',
      userAddress: USER_ADDRESS,
      rwaAmount: '1000',
      holdAmount: '1000',
      bonusAmount: '0',
      holdFee: '5',
      bonusFee: '0',
    });

    expect(poolTransactions.store.size).toBe(1);
    expect(result.id).toHaveLength(24); // Mongo ObjectId hex
    expect(typeof result.createdAt).toBe('number');
    expect(result).not.toHaveProperty('_id');
    expect(Object.keys(result).sort()).toEqual([
      'bonusAmount',
      'bonusFee',
      'createdAt',
      'holdAmount',
      'holdFee',
      'id',
      'poolAddress',
      'rwaAmount',
      'timestamp',
      'transactionType',
      'updatedAt',
      'userAddress',
    ]);
    // The result must be plain JSON - no ObjectId or class instances leaking to the caller.
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  test('recordMint: explicit bonus amounts are preserved and forwarded', async () => {
    const result = await service.recordBurn({ ...BURN_EVENT });

    expect(poolTransactions.create).toHaveBeenCalledWith(
      expect.objectContaining({ bonusAmount: '100', bonusFee: '3' }),
    );
    expect(redis.publish).toHaveBeenCalledWith(
      `charts:transactions:${POOL_ADDRESS}`,
      'TRANSACTION_UPDATE',
      expect.objectContaining({ bonusAmount: '100', bonusFee: '3' }),
    );
    expect(result.bonusAmount).toBe('100');
    expect(result.bonusFee).toBe('3');
  });

  test('recordMint: an empty-string bonus amount is coerced to "0" (|| fallback, not ??)', async () => {
    const result = await service.recordBurn({ ...BURN_EVENT, data: { ...BURN_EVENT.data, bonusAmountReceived: '', bonusFeePaid: '' } });

    expect(poolTransactions.create).toHaveBeenCalledWith(
      expect.objectContaining({ bonusAmount: '0', bonusFee: '0' }),
    );
    expect(result.bonusAmount).toBe('0');
    expect(result.bonusFee).toBe('0');
  });

  test('recordMint: propagates a repository failure without publishing', async () => {
    poolTransactions.create.mockRejectedValueOnce(new Error('db unavailable'));

    await expect(service.recordMint({ ...MINT_EVENT })).rejects.toThrow('db unavailable');

    expect(redis.publish).toHaveBeenCalledTimes(0);
  });

  test('recordMint: publishes after the write, so a publish failure leaves the stored row', async () => {
    // Current ordering: repository.create runs first, the Redis publish second.
    // A publish failure therefore rejects the call while the row stays stored.
    redis.publish.mockRejectedValueOnce(new Error('redis unavailable'));

    await expect(service.recordMint({ ...MINT_EVENT })).rejects.toThrow('redis unavailable');

    expect(poolTransactions.store.size).toBe(1);
  });

  test('getTransactions: forwards filter/sort/limit/offset and maps every row', async () => {
    const first = await seedTransaction({ timestamp: 100 });
    await seedTransaction({ timestamp: 200, transactionType: PoolTransactionType.BURN, rwaAmount: '500' });
    await seedTransaction({ timestamp: 300, poolAddress: '0x0000000000000000000000000000000000000001' });

    const result = await service.getTransactions({
      filter: { poolAddress: POOL_ADDRESS },
      sort: { timestamp: 'desc' },
      limit: 5,
      offset: 1,
    });

    expect(poolTransactions.findAll).toHaveBeenCalledTimes(1);
    expect(poolTransactions.findAll).toHaveBeenCalledWith(
      { poolAddress: POOL_ADDRESS },
      { timestamp: 'desc' },
      5,
      1,
    );

    // Descending [200, 100], then offset 1 keeps only the older row.
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(first._id.toString());
    expect(result[0].transactionType).toBe('MINT');
    expect(result[0]).not.toHaveProperty('_id');
    expect(JSON.parse(JSON.stringify(result[0]))).toEqual(result[0]);
  });

  test('getTransactions: a filter that matches nothing returns an empty array', async () => {
    await seedTransaction();

    const result = await service.getTransactions({ filter: { poolAddress: '0x0000000000000000000000000000000000000002' } });

    expect(result).toEqual([]);
  });

  test('getVolumeData: converts every supported interval to seconds before delegating', async () => {
    for (const [interval, seconds] of INTERVAL_SECONDS) {
      poolTransactions.aggregateVolumeData.mockClear();

      await service.getVolumeData({
        poolAddress: POOL_ADDRESS,
        interval,
        startTime: 0,
        endTime: 1_000_000,
        limit: 10,
      });

      expect(poolTransactions.aggregateVolumeData).toHaveBeenCalledTimes(1);
      expect(poolTransactions.aggregateVolumeData).toHaveBeenCalledWith(POOL_ADDRESS, seconds, 0, 1_000_000, 10);
    }
  });

  test('getVolumeData: an unsupported interval is rejected before the repository runs', async () => {
    await expect(
      service.getVolumeData({ poolAddress: POOL_ADDRESS, interval: '3m', startTime: 0, endTime: 1000 }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Unsupported interval: 3m',
    });

    expect(poolTransactions.aggregateVolumeData).toHaveBeenCalledTimes(0);
  });

  test('getVolumeData: returns the aggregation rows as-is', async () => {
    poolTransactions.aggregateVolumeData.mockImplementationOnce(async () => [
      { timestamp: 60, mintVolume: '150', burnVolume: '20' },
      { timestamp: 180, mintVolume: '300', burnVolume: '0' },
    ]);

    const result = await service.getVolumeData({
      poolAddress: POOL_ADDRESS,
      interval: '1m',
      startTime: 0,
      endTime: 1000,
    });

    expect(result).toEqual([
      { timestamp: 60, mintVolume: '150', burnVolume: '20' },
      { timestamp: 180, mintVolume: '300', burnVolume: '0' },
    ]);
    expect(Object.keys(result[0]).sort()).toEqual(['burnVolume', 'mintVolume', 'timestamp']);
    expect(poolTransactions.aggregateVolumeData).toHaveBeenCalledWith(POOL_ADDRESS, 60, 0, 1000, undefined);
  });
});
