/**
 * Unit tests for BlockchainEventsDaemon.
 *
 * Scope: the daemon's event routing table. The RabbitMQ machinery and the
 * delivery pipeline live in @shared/ordered-consumer (covered by the package's
 * own tests). Real ChartsService and TransactionsService instances run on fake
 * repositories and a fake RedisEventsClient (through the real ChartEventsClient);
 * nothing connects to a broker, Redis, or a database. Run with `bun test` from
 * services/charts.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { AppError } from '@shared/errors/app-errors';
import {
  BlockchainEventsDaemon,
  BLOCKCHAIN_EVENTS_EXCHANGE,
  BLOCKCHAIN_EVENTS_QUEUE,
} from '../src/daemons/blockchainEvents.daemon';
import type { BlockchainEvent } from '@shared/blockchain';
import { ChartsService } from '../src/services/charts.service';
import { TransactionsService } from '../src/services/transactions.service';
import { ChartEventsClient } from '../src/clients/redis.client';
import { PoolTransactionType } from '../src/models/shared/enums.model';
import type { RedisEventsClient } from '@shared/redis-events/src/redis-events.client';
import type { PriceDataRepository } from '../src/repositories/priceData.repository';
import type { PoolTransactionRepository } from '../src/repositories/poolTransaction.repository';
import { createFakePriceDataRepository, type FakePriceDataRepository } from './fakes/priceData.repository.fake';
import {
  createFakePoolTransactionRepository,
  type FakePoolTransactionRepository,
} from './fakes/poolTransaction.repository.fake';
import { createFakeRedisEventsClient, type FakeRedisEventsClient } from './fakes/redis-events.client.fake';

const POOL_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const MINTER_ADDRESS = '0x1234567890AbcdEF1234567890aBcdef12345678';
const BURNER_ADDRESS = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
const EVENT_TIMESTAMP = 1_700_000_000;
const BLOCK_NUMBER = 12_345_678;

function makeEvent(name: string, data: Record<string, unknown>): BlockchainEvent {
  return {
    chainId: 31_337,
    name,
    blockNumber: BLOCK_NUMBER,
    transactionHash: `0x${'ab'.repeat(32)}`,
    address: POOL_ADDRESS,
    logIndex: 3,
    data,
    timestamp: EVENT_TIMESTAMP,
  };
}

describe('BlockchainEventsDaemon (unit, real services on fake repositories and a fake redis client)', () => {
  let priceData: FakePriceDataRepository;
  let poolTransactions: FakePoolTransactionRepository;
  let redis: FakeRedisEventsClient;
  let chartEvents: ChartEventsClient;
  let daemon: BlockchainEventsDaemon;
  let routing: ReturnType<BlockchainEventsDaemon['getEventRouting']>;

  beforeEach(() => {
    priceData = createFakePriceDataRepository();
    poolTransactions = createFakePoolTransactionRepository();
    redis = createFakeRedisEventsClient();
    chartEvents = new ChartEventsClient(redis as unknown as RedisEventsClient);

    const chartsService = new ChartsService(priceData as unknown as PriceDataRepository, chartEvents);
    const transactionsService = new TransactionsService(
      poolTransactions as unknown as PoolTransactionRepository,
      chartEvents,
    );

    // the base machinery (rabbit client, consumer service) is never touched here
    daemon = new BlockchainEventsDaemon({} as any, {} as any, chartsService, transactionsService);
    routing = daemon.getEventRouting();
  });

  test('the daemon declares the blockchain events exchange and the charts queue', () => {
    expect(BLOCKCHAIN_EVENTS_EXCHANGE).toBe('blockchain.events');
    expect(BLOCKCHAIN_EVENTS_QUEUE).toBe('blockchain.events.charts');
  });

  describe('event routing', () => {
    test('registers exactly the three pool events of the charts service', () => {
      expect(Object.keys(routing).sort()).toEqual(['Pool_ReservesUpdated', 'Pool_RwaBurned', 'Pool_RwaMinted']);
    });

    test('Pool_ReservesUpdated: records the price and publishes the price update', async () => {
      // Raw uint256 values arrive as bigint from the scanner; the handler stringifies them.
      await routing['Pool_ReservesUpdated'](
        makeEvent('Pool_ReservesUpdated', {
          emittedFrom: POOL_ADDRESS,
          realHoldReserve: 500n,
          virtualHoldReserve: 1000n,
          virtualRwaReserve: 4n,
        }),
      );

      expect(priceData.create).toHaveBeenCalledTimes(1);
      expect(priceData.create).toHaveBeenCalledWith({
        poolAddress: POOL_ADDRESS,
        timestamp: EVENT_TIMESTAMP,
        blockNumber: BLOCK_NUMBER,
        realHoldReserve: '500',
        virtualHoldReserve: '1000',
        virtualRwaReserve: '4',
        price: '375', // (1000 + 500) / 4
      });
      expect(priceData.store.size).toBe(1);

      expect(redis.publish).toHaveBeenCalledTimes(1);
      expect(redis.publish).toHaveBeenCalledWith(`charts:price:${POOL_ADDRESS}`, 'PRICE_UPDATE', {
        poolAddress: POOL_ADDRESS,
        timestamp: EVENT_TIMESTAMP,
        price: '375',
        realHoldReserve: '500',
        virtualHoldReserve: '1000',
        virtualRwaReserve: '4',
      });
    });

    test('Pool_RwaMinted: records a MINT transaction with zero bonus fields and publishes it', async () => {
      // Amounts that already went through JSON (strings) are handled the same way.
      await routing['Pool_RwaMinted'](
        makeEvent('Pool_RwaMinted', {
          emittedFrom: POOL_ADDRESS,
          minter: MINTER_ADDRESS,
          rwaAmountMinted: '1000',
          holdAmountPaid: '1000',
          feePaid: '5',
        }),
      );

      expect(poolTransactions.create).toHaveBeenCalledTimes(1);
      expect(poolTransactions.create).toHaveBeenCalledWith({
        poolAddress: POOL_ADDRESS,
        transactionType: PoolTransactionType.MINT,
        userAddress: MINTER_ADDRESS,
        timestamp: EVENT_TIMESTAMP,
        rwaAmount: '1000',
        holdAmount: '1000',
        holdFee: '5',
        bonusAmount: '0',
        bonusFee: '0',
      });

      expect(redis.publish).toHaveBeenCalledTimes(1);
      expect(redis.publish).toHaveBeenCalledWith(`charts:transactions:${POOL_ADDRESS}`, 'TRANSACTION_UPDATE', {
        poolAddress: POOL_ADDRESS,
        timestamp: EVENT_TIMESTAMP,
        transactionType: 'MINT',
        userAddress: MINTER_ADDRESS,
        rwaAmount: '1000',
        holdAmount: '1000',
        bonusAmount: '0',
        holdFee: '5',
        bonusFee: '0',
      });
    });

    test('Pool_RwaBurned: records a BURN transaction with the bonus amounts from the event', async () => {
      await routing['Pool_RwaBurned'](
        makeEvent('Pool_RwaBurned', {
          emittedFrom: POOL_ADDRESS,
          burner: BURNER_ADDRESS,
          rwaAmountBurned: 2000n,
          holdAmountReceived: 1500n,
          bonusAmountReceived: 100n,
          holdFeePaid: 7n,
          bonusFeePaid: 3n,
        }),
      );

      expect(poolTransactions.create).toHaveBeenCalledWith({
        poolAddress: POOL_ADDRESS,
        transactionType: PoolTransactionType.BURN,
        userAddress: BURNER_ADDRESS,
        timestamp: EVENT_TIMESTAMP,
        rwaAmount: '2000',
        holdAmount: '1500',
        bonusAmount: '100',
        holdFee: '7',
        bonusFee: '3',
      });

      expect(redis.publish).toHaveBeenCalledWith(`charts:transactions:${POOL_ADDRESS}`, 'TRANSACTION_UPDATE', {
        poolAddress: POOL_ADDRESS,
        timestamp: EVENT_TIMESTAMP,
        transactionType: 'BURN',
        userAddress: BURNER_ADDRESS,
        rwaAmount: '2000',
        holdAmount: '1500',
        bonusAmount: '100',
        holdFee: '7',
        bonusFee: '3',
      });
    });

    test('a service failure propagates out of the handler and nothing is published', async () => {
      priceData.create.mockRejectedValueOnce(
        new AppError({ message: 'db down', statusCode: 503, code: 'SERVICE_UNAVAILABLE' }),
      );

      await expect(
        routing['Pool_ReservesUpdated'](
          makeEvent('Pool_ReservesUpdated', {
            emittedFrom: POOL_ADDRESS,
            realHoldReserve: 500n,
            virtualHoldReserve: 1000n,
            virtualRwaReserve: 4n,
          }),
        ),
      ).rejects.toMatchObject({ statusCode: 503, code: 'SERVICE_UNAVAILABLE' });

      expect(redis.publish).toHaveBeenCalledTimes(0);
    });

    test('a publish failure still leaves the row in the repository (write-then-publish order)', async () => {
      redis.publish.mockRejectedValueOnce(new Error('redis unavailable'));

      await expect(
        routing['Pool_ReservesUpdated'](
          makeEvent('Pool_ReservesUpdated', {
            emittedFrom: POOL_ADDRESS,
            realHoldReserve: 500n,
            virtualHoldReserve: 1000n,
            virtualRwaReserve: 4n,
          }),
        ),
      ).rejects.toThrow('redis unavailable');

      expect(priceData.store.size).toBe(1);
    });
  });
});
