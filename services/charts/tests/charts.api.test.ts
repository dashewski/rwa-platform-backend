/**
 * Component tests for the charts HTTP layer.
 *
 * The whole Elysia app is assembled in-process: real controllers and real
 * ChartsService/TransactionsService, with repositories and clients replaced by
 * in-memory fakes. Requests go through app.handle() - no port is bound and
 * nothing is queried over the network. `createApp()` is never called because
 * it connects mongoose; the plugins are composed exactly like app.ts does.
 * Run with `bun test` from services/charts.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { ErrorHandlerPlugin } from '@shared/errors/error-handler.plugin';
import { createServicesPlugin } from '../src/plugins/services.plugin';
import { createControllersPlugin } from '../src/plugins/controllers.plugin';
import type { RepositoriesPlugin } from '../src/plugins/repositories.plugin';
import type { ClientsPlugin } from '../src/plugins/clients.plugin';
import { createFakePriceDataRepository, type FakePriceDataRepository } from './fakes/priceData.repository.fake';
import {
  createFakePoolTransactionRepository,
  type CreatePoolTransactionInput,
  type FakePoolTransactionRepository,
} from './fakes/poolTransaction.repository.fake';
import { createFakeChartEventsClient, type FakeChartEventsClient } from './fakes/chart-events.client.fake';
import { createFakeRedisEventsClient, type FakeRedisEventsClient } from './fakes/redis-events.client.fake';

const POOL_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const OTHER_POOL_ADDRESS = '0x0000000000000000000000000000000000000001';
const USER_ADDRESS = '0x1234567890AbcdEF1234567890aBcdef12345678';

function buildApp(
  priceData: FakePriceDataRepository,
  poolTransactions: FakePoolTransactionRepository,
  chartEvents: FakeChartEventsClient,
  redis: FakeRedisEventsClient,
) {
  const repositoriesPlugin = new Elysia({ name: 'Repositories' })
    .decorate('priceDataRepository', priceData)
    .decorate('poolTransactionRepository', poolTransactions);

  const clientsPlugin = new Elysia({ name: 'Clients' })
    .decorate('redisEventsClient', redis)
    .decorate('chartEventsClient', chartEvents);

  const servicesPlugin = createServicesPlugin(
    repositoriesPlugin as unknown as RepositoriesPlugin,
    clientsPlugin as unknown as ClientsPlugin,
  );

  return new Elysia().onError(ErrorHandlerPlugin).use(createControllersPlugin(servicesPlugin));
}

type App = ReturnType<typeof buildApp>;

async function post(app: App, path: string, body: unknown) {
  const response = await app.handle(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

  return { status: response.status, body: (await response.json()) as any };
}

describe('charts HTTP layer (component, fake repositories + fake clients)', () => {
  let priceData: FakePriceDataRepository;
  let poolTransactions: FakePoolTransactionRepository;
  let chartEvents: FakeChartEventsClient;
  let redis: FakeRedisEventsClient;
  let app: App;

  beforeEach(() => {
    priceData = createFakePriceDataRepository();
    poolTransactions = createFakePoolTransactionRepository();
    chartEvents = createFakeChartEventsClient();
    redis = createFakeRedisEventsClient();
    app = buildApp(priceData, poolTransactions, chartEvents, redis);
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

  /** Writes a transaction row straight into the fake repository. */
  async function seedTransaction(overrides: Partial<CreatePoolTransactionInput> = {}) {
    return poolTransactions.create({
      poolAddress: POOL_ADDRESS,
      transactionType: 'MINT',
      userAddress: USER_ADDRESS,
      timestamp: 100,
      rwaAmount: '100',
      holdAmount: '100',
      holdFee: '5',
      ...overrides,
    });
  }

  test('getRawPriceData: returns only the rows of the pool inside the range, mapped', async () => {
    const first = await seedPrice(100, '250');
    await seedPrice(200, '260');
    await seedPrice(150, '240', OTHER_POOL_ADDRESS); // other pool
    await seedPrice(50, '230'); // before the range

    const response = await post(app, '/getRawPriceData', {
      poolAddress: POOL_ADDRESS,
      startTime: 100,
      endTime: 250,
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
    expect(response.body.map((row: any) => row.price)).toEqual(['250', '260']);
    expect(response.body[0].id).toBe(first._id.toString());
    expect(response.body[0]).not.toHaveProperty('_id');
    expect(Object.keys(response.body[0]).sort()).toEqual([
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
  });

  test('getRawPriceData: sort, limit and offset are forwarded end-to-end', async () => {
    await seedPrice(100, '250');
    await seedPrice(200, '260');
    await seedPrice(300, '270');

    const response = await post(app, '/getRawPriceData', {
      poolAddress: POOL_ADDRESS,
      startTime: 0,
      endTime: 1000,
      sort: { timestamp: 'desc' },
      limit: 2,
      offset: 1,
    });

    expect(response.status).toBe(200);
    // Descending [270, 260, 250], offset 1 with limit 2 keeps [260, 250].
    expect(response.body.map((row: any) => row.price)).toEqual(['260', '250']);
    expect(priceData.findByPoolAndTimeRange).toHaveBeenCalledWith(
      POOL_ADDRESS,
      0,
      1000,
      { timestamp: 'desc' },
      2,
      1,
    );
  });

  test('getRawPriceData: an empty range returns an empty array', async () => {
    await seedPrice(100, '250');

    const response = await post(app, '/getRawPriceData', {
      poolAddress: POOL_ADDRESS,
      startTime: 500,
      endTime: 600,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  test('getRawPriceData: an invalid payload never reaches the repository', async () => {
    const response = await post(app, '/getRawPriceData', { startTime: 0, endTime: 1000 });

    expect(response.status).not.toBe(200);
    expect(priceData.findByPoolAndTimeRange).toHaveBeenCalledTimes(0);
  });

  test('getOhlcPriceData: bars are aggregated per interval bucket through the HTTP layer', async () => {
    await seedPrice(3600, '100');
    await seedPrice(3605, '250');
    await seedPrice(3650, '150');
    await seedPrice(7201, '90');
    await seedPrice(7300, '80');

    const response = await post(app, '/getOhlcPriceData', {
      poolAddress: POOL_ADDRESS,
      interval: '1h',
      startTime: 0,
      endTime: 10_000,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { timestamp: 3600, open: '100', high: '250', low: '100', close: '150' },
      { timestamp: 7200, open: '90', high: '90', low: '80', close: '80' },
    ]);
    expect(Object.keys(response.body[0]).sort()).toEqual(['close', 'high', 'low', 'open', 'timestamp']);
    expect(priceData.aggregateOhlcData).toHaveBeenCalledWith(POOL_ADDRESS, 3600, 0, 10_000, undefined);
  });

  test('getOhlcPriceData: an unsupported interval never reaches the repository', async () => {
    const response = await post(app, '/getOhlcPriceData', {
      poolAddress: POOL_ADDRESS,
      interval: '2x',
      startTime: 0,
      endTime: 1000,
    });

    expect(response.status).not.toBe(200);
    expect(priceData.aggregateOhlcData).toHaveBeenCalledTimes(0);
  });

  test('getPoolTransactions: filter and sort are forwarded and every row is mapped', async () => {
    const first = await seedTransaction({ timestamp: 100 });
    await seedTransaction({ timestamp: 200, transactionType: 'BURN', bonusAmount: '7', bonusFee: '3' });
    await seedTransaction({ timestamp: 300 });
    await seedTransaction({ timestamp: 400, poolAddress: OTHER_POOL_ADDRESS });

    const response = await post(app, '/getPoolTransactions', {
      filter: { poolAddress: POOL_ADDRESS },
      sort: { timestamp: 'desc' },
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(3);
    expect(response.body.map((row: any) => row.timestamp)).toEqual([300, 200, 100]);
    expect(poolTransactions.findAll).toHaveBeenCalledWith(
      { poolAddress: POOL_ADDRESS },
      { timestamp: 'desc' },
      undefined,
      undefined,
    );

    const burn = response.body[1];
    expect(burn.transactionType).toBe('BURN');
    expect(burn.bonusAmount).toBe('7');
    expect(burn.bonusFee).toBe('3');

    const mint = response.body[2];
    expect(mint.id).toBe(first._id.toString());
    expect(mint).not.toHaveProperty('_id');
    expect(Object.keys(mint).sort()).toEqual([
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

    // Read routes never publish chart updates.
    expect(chartEvents.publishTransactionUpdate).toHaveBeenCalledTimes(0);
  });

  test('getPoolTransactions: limit and offset paginate the result', async () => {
    await seedTransaction({ timestamp: 100 });
    await seedTransaction({ timestamp: 200 });
    await seedTransaction({ timestamp: 300 });

    const response = await post(app, '/getPoolTransactions', { filter: {}, limit: 1, offset: 1 });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    // Default repository order is { timestamp: 'desc' }: [300, 200, 100]; offset 1 keeps 200.
    expect(response.body[0].timestamp).toBe(200);
  });

  test('getPoolTransactions: a filter that matches nothing returns an empty array', async () => {
    await seedTransaction();

    const response = await post(app, '/getPoolTransactions', {
      filter: { poolAddress: OTHER_POOL_ADDRESS },
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  test('getVolumeData: mint and burn rwa amounts are summed per interval bucket', async () => {
    await seedTransaction({ timestamp: 100, rwaAmount: '100' });
    await seedTransaction({ timestamp: 110, rwaAmount: '50' });
    await seedTransaction({ timestamp: 115, transactionType: 'BURN', rwaAmount: '20' });
    await seedTransaction({ timestamp: 200, rwaAmount: '300' });

    const response = await post(app, '/getVolumeData', {
      poolAddress: POOL_ADDRESS,
      interval: '1m',
      startTime: 0,
      endTime: 1000,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { timestamp: 60, mintVolume: '150', burnVolume: '20' },
      { timestamp: 180, mintVolume: '300', burnVolume: '0' },
    ]);
    expect(poolTransactions.aggregateVolumeData).toHaveBeenCalledWith(POOL_ADDRESS, 60, 0, 1000, undefined);
  });

  test('getVolumeData: an unsupported interval never reaches the repository', async () => {
    const response = await post(app, '/getVolumeData', {
      poolAddress: POOL_ADDRESS,
      interval: '2x',
      startTime: 0,
      endTime: 1000,
    });

    expect(response.status).not.toBe(200);
    expect(poolTransactions.aggregateVolumeData).toHaveBeenCalledTimes(0);
  });
});
