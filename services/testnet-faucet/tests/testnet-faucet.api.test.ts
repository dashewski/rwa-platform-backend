/**
 * Component tests for the testnet-faucet HTTP layer.
 *
 * The whole Elysia app is assembled in-process: real controllers and the real
 * FaucetService, with the repository and the blockchain client replaced by
 * in-memory fakes. Requests go through app.handle() — no port is bound,
 * nothing is queried over the network. Run with `bun test` from
 * services/testnet-faucet.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { AppError } from '@shared/errors/app-errors';
import { ErrorHandlerPlugin } from '@shared/errors/error-handler.plugin';
import { createServicesPlugin } from '../src/plugins/services.plugin';
import { createControllersPlugin } from '../src/plugins/controllers.plugin';
import type { RepositoriesPlugin } from '../src/plugins/repositories.plugin';
import type { ClientsPlugin } from '../src/plugins/clients.plugin';
import {
  createFakeFaucetRequestRepository,
  type FakeFaucetRequestRepository,
} from './fakes/faucetRequest.repository.fake';
import { createFakeBlockchainClient, type FakeBlockchainClient } from './fakes/blockchain.client.fake';

const WALLET = '0x1111111111111111111111111111111111111111';

const HOLD_TOKEN_ADDRESS = '0x2222222222222222222222222222222222222222';
const PLATFORM_TOKEN_ADDRESS = '0x3333333333333333333333333333333333333333';

const GAS_TOKEN_AMOUNT = 1;
const HOLD_TOKEN_AMOUNT = 100;
const PLATFORM_TOKEN_AMOUNT = 250;

const REQUEST_GAS_DELAY = 60;
const REQUEST_HOLD_DELAY = 120;
const REQUEST_PLATFORM_DELAY = 180;

const REQUEST = {
  userId: 'user-1',
  wallet: WALLET,
  amount: 0.5,
};

function buildApp(faucetRequests: FakeFaucetRequestRepository, blockchainClient: FakeBlockchainClient) {
  const repositoriesPlugin = new Elysia({ name: 'Repositories' }).decorate('faucetRequestRepository', faucetRequests);
  const clientsPlugin = new Elysia({ name: 'Clients' }).decorate('blockchainClient', blockchainClient);

  const servicesPlugin = createServicesPlugin(
    repositoriesPlugin as unknown as RepositoriesPlugin,
    clientsPlugin as unknown as ClientsPlugin,
    HOLD_TOKEN_ADDRESS,
    PLATFORM_TOKEN_ADDRESS,
    GAS_TOKEN_AMOUNT,
    HOLD_TOKEN_AMOUNT,
    PLATFORM_TOKEN_AMOUNT,
    REQUEST_GAS_DELAY,
    REQUEST_HOLD_DELAY,
    REQUEST_PLATFORM_DELAY,
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

describe('testnet-faucet HTTP layer (component, fake repository + fake blockchain client)', () => {
  let faucetRequests: FakeFaucetRequestRepository;
  let blockchainClient: FakeBlockchainClient;
  let app: App;

  beforeEach(() => {
    faucetRequests = createFakeFaucetRequestRepository();
    blockchainClient = createFakeBlockchainClient();
    app = buildApp(faucetRequests, blockchainClient);
  });

  test('requestGas → getHistory round-trip', async () => {
    const created = await post(app, '/requestGas', REQUEST);

    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({
      userId: REQUEST.userId,
      wallet: WALLET,
      tokenType: 'gas',
      amount: REQUEST.amount,
    });
    expect(typeof created.body.id).toBe('string');
    expect(created.body.id).toHaveLength(24); // Mongo ObjectId hex
    expect(created.body.transactionHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(blockchainClient.transferToken).toHaveBeenCalledWith(WALLET, '0.5');

    const history = await post(app, '/getHistory', { userId: REQUEST.userId });
    expect(history.status).toBe(200);
    expect(history.body).toHaveLength(1);
    expect(history.body[0].id).toBe(created.body.id);
    expect(history.body[0].transactionHash).toBe(created.body.transactionHash);
  });

  test('requestGas: an amount above the limit is capped end-to-end', async () => {
    const created = await post(app, '/requestGas', { ...REQUEST, amount: GAS_TOKEN_AMOUNT * 5 });

    expect(created.status).toBe(200);
    expect(created.body.amount).toBe(GAS_TOKEN_AMOUNT);
    expect(blockchainClient.transferToken).toHaveBeenCalledWith(WALLET, `${GAS_TOKEN_AMOUNT}`);
    expect(blockchainClient.transfers).toHaveLength(1);
  });

  test('requestHold: transfers through the HOLD token address and returns tokenType hold', async () => {
    const created = await post(app, '/requestHold', { ...REQUEST, amount: HOLD_TOKEN_AMOUNT });

    expect(created.status).toBe(200);
    expect(created.body.tokenType).toBe('hold');
    expect(created.body.amount).toBe(HOLD_TOKEN_AMOUNT);
    expect(blockchainClient.transferERC20Token).toHaveBeenCalledWith(
      HOLD_TOKEN_ADDRESS,
      WALLET,
      `${HOLD_TOKEN_AMOUNT}`,
    );
    expect(blockchainClient.transferToken).toHaveBeenCalledTimes(0);
  });

  test('requestPlatform: transfers through the PLATFORM token address and returns tokenType platform', async () => {
    const created = await post(app, '/requestPlatform', { ...REQUEST, amount: PLATFORM_TOKEN_AMOUNT });

    expect(created.status).toBe(200);
    expect(created.body.tokenType).toBe('platform');
    expect(created.body.amount).toBe(PLATFORM_TOKEN_AMOUNT);
    expect(blockchainClient.transferERC20Token).toHaveBeenCalledWith(
      PLATFORM_TOKEN_ADDRESS,
      WALLET,
      `${PLATFORM_TOKEN_AMOUNT}`,
    );
  });

  test('requestGas: an invalid payload never reaches the service', async () => {
    const response = await post(app, '/requestGas', { userId: REQUEST.userId, wallet: WALLET });

    expect(response.status).not.toBe(200);
    expect(blockchainClient.transferToken).toHaveBeenCalledTimes(0);
    expect(faucetRequests.create).toHaveBeenCalledTimes(0);
  });

  test('requestPlatform: a non-numeric amount never reaches the service', async () => {
    const response = await post(app, '/requestPlatform', { ...REQUEST, amount: 'five' });

    expect(response.status).not.toBe(200);
    expect(blockchainClient.transferERC20Token).toHaveBeenCalledTimes(0);
    expect(faucetRequests.create).toHaveBeenCalledTimes(0);
  });

  test('getUnlockTime: zeros before any request, then the cooldown of the requested token type', async () => {
    const initial = await post(app, '/getUnlockTime', { userId: REQUEST.userId });
    expect(initial.status).toBe(200);
    expect(initial.body).toEqual({ gasUnlockTime: 0, holdUnlockTime: 0, platformUnlockTime: 0 });

    await post(app, '/requestGas', REQUEST);

    const after = await post(app, '/getUnlockTime', { userId: REQUEST.userId });
    expect(after.status).toBe(200);
    expect(after.body.gasUnlockTime).toBeGreaterThan(0);
    expect(after.body.holdUnlockTime).toBe(0);
    expect(after.body.platformUnlockTime).toBe(0);
  });

  test('getUnlockTime: another users request does not unlock the caller', async () => {
    await post(app, '/requestGas', { ...REQUEST, userId: 'user-2' });

    const response = await post(app, '/getUnlockTime', { userId: REQUEST.userId });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ gasUnlockTime: 0, holdUnlockTime: 0, platformUnlockTime: 0 });
  });

  test('getHistory: pagination is forwarded end-to-end', async () => {
    await post(app, '/requestGas', REQUEST);
    await post(app, '/requestHold', { ...REQUEST, amount: HOLD_TOKEN_AMOUNT });

    const page = await post(app, '/getHistory', {
      userId: REQUEST.userId,
      pagination: { limit: 1, offset: 1 },
    });

    expect(page.status).toBe(200);
    expect(page.body).toHaveLength(1);
    expect(page.body[0].tokenType).toBe('hold'); // insertion order is stable in the fake
  });

  test('getHistory: a limit above 100 maps to 400 VALIDATION_ERROR', async () => {
    const response = await post(app, '/getHistory', {
      userId: REQUEST.userId,
      pagination: { limit: 101 },
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Limit cannot exceed 100' },
    });
  });

  test('getHistory: a negative offset maps to 400 VALIDATION_ERROR', async () => {
    const response = await post(app, '/getHistory', {
      userId: REQUEST.userId,
      pagination: { offset: -1 },
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Offset cannot be negative' },
    });
  });

  test('requestGas: a blockchain failure maps to 502 BLOCKCHAIN_ERROR and records nothing', async () => {
    blockchainClient.transferToken.mockImplementationOnce(async () => {
      throw new AppError({ message: 'Insufficient funds in faucet wallet', statusCode: 502, code: 'BLOCKCHAIN_ERROR' });
    });

    const response = await post(app, '/requestGas', REQUEST);

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      error: { code: 'BLOCKCHAIN_ERROR', message: 'Insufficient funds in faucet wallet' },
    });
    expect(faucetRequests.create).toHaveBeenCalledTimes(0);
  });

  test('requestHold: a persistence failure maps to 500 INTERNAL_ERROR after the transfer was sent', async () => {
    faucetRequests.create.mockImplementationOnce(async () => {
      throw new AppError({ message: 'Faucet request write failed', statusCode: 500, code: 'INTERNAL_ERROR' });
    });

    const response = await post(app, '/requestHold', { ...REQUEST, amount: HOLD_TOKEN_AMOUNT });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Faucet request write failed' },
    });
    expect(blockchainClient.transferERC20Token).toHaveBeenCalledTimes(1);
  });
});
