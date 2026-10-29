/**
 * Component tests for the portfolio HTTP layer.
 *
 * The whole Elysia app is assembled in-process: real controllers and the real
 * PortfolioService, with repositories replaced by in-memory fakes. Requests go
 * through app.handle() - no port is bound, nothing is queried over the network.
 * Run with `bun test` from services/portfolio.
 *
 * Scope note: the HTTP layer consumes repositories only (services.plugin.ts
 * reads tokenBalanceRepository/transactionRepository). The rabbitMQClient is a
 * daemon-only dependency, so no fake Clients plugin takes part in this
 * assembly; its fake is exercised in blockchainEvents.daemon.test.ts.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { AppError } from '@shared/errors/app-errors';
import { ErrorHandlerPlugin } from '@shared/errors/error-handler.plugin';
import { createServicesPlugin } from '../src/plugins/services.plugin';
import { createControllersPlugin } from '../src/plugins/controllers.plugin';
import type { RepositoriesPlugin } from '../src/plugins/repositories.plugin';
import {
  createFakeTokenBalanceRepository,
  type FakeTokenBalanceRepository,
} from './fakes/tokenBalance.repository.fake';
import { createFakeTransactionRepository, type FakeTransactionRepository } from './fakes/transaction.repository.fake';

const OWNER_A = '0x1111111111111111111111111111111111111111';
const OWNER_B = '0x2222222222222222222222222222222222222222';
const TOKEN_ADDRESS = '0x3333333333333333333333333333333333333333';
const POOL_ADDRESS = '0x4444444444444444444444444444444444444444';
const CHAIN_ID = '137';

function buildApp(balances: FakeTokenBalanceRepository, transactions: FakeTransactionRepository) {
  const repositoriesPlugin = new Elysia({ name: 'Repositories' })
    .decorate('tokenBalanceRepository', balances)
    .decorate('transactionRepository', transactions);

  const servicesPlugin = createServicesPlugin(repositoriesPlugin as unknown as RepositoriesPlugin);

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

describe('portfolio HTTP layer (component, fake repositories)', () => {
  let balances: FakeTokenBalanceRepository;
  let transactions: FakeTransactionRepository;
  let app: App;

  beforeEach(() => {
    balances = createFakeTokenBalanceRepository();
    transactions = createFakeTransactionRepository();
    app = buildApp(balances, transactions);
  });

  test('getBalances: returns mapped rows for the filtered owner', async () => {
    await balances.updateBalance(OWNER_A, TOKEN_ADDRESS, '7', POOL_ADDRESS, CHAIN_ID, 100, 10);
    await balances.updateBalance(OWNER_B, TOKEN_ADDRESS, '7', POOL_ADDRESS, CHAIN_ID, 55, 11);

    const response = await post(app, '/getBalances', { filter: { owner: OWNER_A } });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      owner: OWNER_A,
      tokenAddress: TOKEN_ADDRESS,
      tokenId: '7',
      poolAddress: POOL_ADDRESS,
      chainId: CHAIN_ID,
      balance: 100,
      lastUpdateBlock: 10,
    });
    expect(typeof response.body[0].id).toBe('string');
    expect(response.body[0]).not.toHaveProperty('_id');
    expect(JSON.parse(JSON.stringify(response.body[0]))).toEqual(response.body[0]);
  });

  test('getBalances: filter and pagination are forwarded end-to-end', async () => {
    await balances.updateBalance(OWNER_A, TOKEN_ADDRESS, '1', POOL_ADDRESS, CHAIN_ID, 10, 1);
    await balances.updateBalance(OWNER_A, TOKEN_ADDRESS, '2', POOL_ADDRESS, CHAIN_ID, 20, 2);
    await balances.updateBalance(OWNER_B, TOKEN_ADDRESS, '3', POOL_ADDRESS, CHAIN_ID, 30, 3);

    const all = await post(app, '/getBalances', {});
    expect(all.status).toBe(200);
    expect(all.body).toHaveLength(3);

    const filtered = await post(app, '/getBalances', { filter: { owner: OWNER_A } });
    expect(filtered.body).toHaveLength(2);

    const firstPage = await post(app, '/getBalances', { limit: 2, offset: 0 });
    expect(firstPage.body).toHaveLength(2);
    expect(firstPage.body.map((row: any) => row.owner)).toEqual([OWNER_A, OWNER_A]);

    const secondPage = await post(app, '/getBalances', { limit: 2, offset: 2 });
    expect(secondPage.body).toHaveLength(1);
    expect(secondPage.body[0].owner).toBe(OWNER_B);
    expect(secondPage.body[0].tokenId).toBe('3');
  });

  test('getTransactions: returns mapped transactions for the filtered sender', async () => {
    await transactions.create({
      from: OWNER_A,
      to: OWNER_B,
      tokenAddress: TOKEN_ADDRESS,
      tokenId: '7',
      poolAddress: POOL_ADDRESS,
      chainId: CHAIN_ID,
      transactionHash: '0xtx0001',
      logIndex: 0,
      blockNumber: 100,
      amount: 250,
    });
    await transactions.create({
      from: OWNER_B,
      to: OWNER_A,
      tokenAddress: TOKEN_ADDRESS,
      tokenId: '7',
      poolAddress: POOL_ADDRESS,
      chainId: CHAIN_ID,
      transactionHash: '0xtx0002',
      logIndex: 0,
      blockNumber: 101,
      amount: 1.5,
    });

    const response = await post(app, '/getTransactions', { filter: { from: OWNER_A } });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      from: OWNER_A,
      to: OWNER_B,
      tokenAddress: TOKEN_ADDRESS,
      tokenId: '7',
      poolAddress: POOL_ADDRESS,
      chainId: CHAIN_ID,
      transactionHash: '0xtx0001',
      blockNumber: 100,
      amount: 250,
    });
    expect(typeof response.body[0].id).toBe('string');
    expect(response.body[0]).not.toHaveProperty('_id');
    expect(JSON.parse(JSON.stringify(response.body[0]))).toEqual(response.body[0]);
  });

  test('getTransactions: an empty body lists every transaction', async () => {
    await transactions.create({
      from: OWNER_A,
      to: OWNER_B,
      tokenAddress: TOKEN_ADDRESS,
      tokenId: '7',
      poolAddress: POOL_ADDRESS,
      chainId: CHAIN_ID,
      transactionHash: '0xtx0001',
      logIndex: 0,
      blockNumber: 100,
      amount: 1,
    });
    await transactions.create({
      from: OWNER_B,
      to: OWNER_A,
      tokenAddress: TOKEN_ADDRESS,
      tokenId: '7',
      poolAddress: POOL_ADDRESS,
      chainId: CHAIN_ID,
      transactionHash: '0xtx0002',
      logIndex: 0,
      blockNumber: 101,
      amount: 2,
    });

    const response = await post(app, '/getTransactions', {});

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
  });

  test('an invalid payload never reaches the repository', async () => {
    const response = await post(app, '/getBalances', { limit: 'ten' });

    expect(response.status).not.toBe(200);
    expect(balances.findAll).toHaveBeenCalledTimes(0);
  });

  test('a repository AppError maps to its status code and error envelope', async () => {
    balances.findAll.mockImplementation(async () => {
      throw new AppError({ message: 'Portfolio storage unavailable', statusCode: 503, code: 'SERVICE_UNAVAILABLE' });
    });

    const response = await post(app, '/getBalances', {});

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Portfolio storage unavailable' } });
  });
});
