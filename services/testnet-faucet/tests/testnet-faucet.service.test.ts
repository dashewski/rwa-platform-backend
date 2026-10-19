/**
 * Unit tests for FaucetService.
 *
 * Scope: the service layer only. The repository and the blockchain client are
 * replaced with in-memory fakes (tests/fakes/*.fake.ts), so these tests need
 * no database, no RPC and no network. Run with `bun test` from
 * services/testnet-faucet.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { AppError } from '@shared/errors/app-errors';
import { FaucetService } from '../src/services/faucet.service';
import type { FaucetRequestRepository } from '../src/repositories/faucetRequest.repository';
import type { BlockchainClient } from '../src/clients/blockchain.client';
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

function buildService(faucetRequests: FakeFaucetRequestRepository, blockchainClient: FakeBlockchainClient) {
  return new FaucetService(
    faucetRequests as unknown as FaucetRequestRepository,
    blockchainClient as unknown as BlockchainClient,
    HOLD_TOKEN_ADDRESS,
    PLATFORM_TOKEN_ADDRESS,
    GAS_TOKEN_AMOUNT,
    HOLD_TOKEN_AMOUNT,
    PLATFORM_TOKEN_AMOUNT,
    REQUEST_GAS_DELAY,
    REQUEST_HOLD_DELAY,
    REQUEST_PLATFORM_DELAY,
  );
}

describe('FaucetService (unit, fake repository + fake blockchain client)', () => {
  let faucetRequests: FakeFaucetRequestRepository;
  let blockchainClient: FakeBlockchainClient;
  let service: FaucetService;

  beforeEach(() => {
    faucetRequests = createFakeFaucetRequestRepository();
    blockchainClient = createFakeBlockchainClient();
    service = buildService(faucetRequests, blockchainClient);
  });

  test('requestGasToken: forwards the wallet and amount to the client and records a mapped request', async () => {
    const request = await service.requestGasToken({ ...REQUEST });

    expect(blockchainClient.transferToken).toHaveBeenCalledTimes(1);
    expect(blockchainClient.transferToken).toHaveBeenCalledWith(WALLET, '0.5');
    expect(blockchainClient.transfers).toEqual([
      { kind: 'native', recipientAddress: WALLET, amount: '0.5', transactionHash: request.transactionHash },
    ]);

    expect(faucetRequests.create).toHaveBeenCalledTimes(1);
    expect(faucetRequests.create).toHaveBeenCalledWith({
      userId: REQUEST.userId,
      wallet: WALLET,
      tokenType: 'gas',
      amount: 0.5,
      transactionHash: request.transactionHash,
    });

    expect(request).toMatchObject({ userId: REQUEST.userId, wallet: WALLET, tokenType: 'gas', amount: 0.5 });
    expect(typeof request.id).toBe('string');
    expect(request.id).toHaveLength(24); // Mongo ObjectId hex
    expect(request.transactionHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(typeof request.createdAt).toBe('number');
    expect(request).not.toHaveProperty('_id');
    // The result must be plain JSON — no ObjectId or class instances leaking to the caller.
    expect(JSON.parse(JSON.stringify(request))).toEqual(request);
  });

  test('requestGasToken: an amount above the limit is capped at the configured gas amount', async () => {
    const request = await service.requestGasToken({ ...REQUEST, amount: GAS_TOKEN_AMOUNT * 5 });

    expect(blockchainClient.transferToken).toHaveBeenCalledWith(WALLET, `${GAS_TOKEN_AMOUNT}`);
    expect(request.amount).toBe(GAS_TOKEN_AMOUNT);

    const [stored] = Array.from(faucetRequests.store.values());
    expect(stored.amount).toBe(GAS_TOKEN_AMOUNT);
    expect(stored.transactionHash).toBe(request.transactionHash);
  });

  test('requestGasToken: an amount equal to the limit is transferred unchanged', async () => {
    const request = await service.requestGasToken({ ...REQUEST, amount: GAS_TOKEN_AMOUNT });

    expect(blockchainClient.transferToken).toHaveBeenCalledWith(WALLET, `${GAS_TOKEN_AMOUNT}`);
    expect(request.amount).toBe(GAS_TOKEN_AMOUNT);
  });

  test('requestHoldToken: transfers through the configured HOLD token address and records tokenType hold', async () => {
    const request = await service.requestHoldToken({ ...REQUEST, amount: 25 });

    expect(blockchainClient.transferERC20Token).toHaveBeenCalledTimes(1);
    expect(blockchainClient.transferERC20Token).toHaveBeenCalledWith(HOLD_TOKEN_ADDRESS, WALLET, '25');
    expect(blockchainClient.transferToken).toHaveBeenCalledTimes(0);
    expect(blockchainClient.transfers).toEqual([
      {
        kind: 'erc20',
        tokenAddress: HOLD_TOKEN_ADDRESS,
        recipientAddress: WALLET,
        amount: '25',
        transactionHash: request.transactionHash,
      },
    ]);

    expect(faucetRequests.create).toHaveBeenCalledWith({
      userId: REQUEST.userId,
      wallet: WALLET,
      tokenType: 'hold',
      amount: 25,
      transactionHash: request.transactionHash,
    });
    expect(request.tokenType).toBe('hold');
    expect(request).not.toHaveProperty('_id');
  });

  test('requestHoldToken: an amount above the limit is capped at the configured hold amount', async () => {
    const request = await service.requestHoldToken({ ...REQUEST, amount: HOLD_TOKEN_AMOUNT * 3 });

    expect(blockchainClient.transferERC20Token).toHaveBeenCalledWith(
      HOLD_TOKEN_ADDRESS,
      WALLET,
      `${HOLD_TOKEN_AMOUNT}`,
    );
    expect(request.amount).toBe(HOLD_TOKEN_AMOUNT);

    const [stored] = Array.from(faucetRequests.store.values());
    expect(stored.amount).toBe(HOLD_TOKEN_AMOUNT);
    expect(stored.tokenType).toBe('hold');
  });

  test('requestPlatformToken: transfers through the configured PLATFORM token address and records tokenType platform', async () => {
    const request = await service.requestPlatformToken({ ...REQUEST, amount: 30 });

    expect(blockchainClient.transferERC20Token).toHaveBeenCalledTimes(1);
    expect(blockchainClient.transferERC20Token).toHaveBeenCalledWith(PLATFORM_TOKEN_ADDRESS, WALLET, '30');
    expect(blockchainClient.transferToken).toHaveBeenCalledTimes(0);

    expect(faucetRequests.create).toHaveBeenCalledWith({
      userId: REQUEST.userId,
      wallet: WALLET,
      tokenType: 'platform',
      amount: 30,
      transactionHash: request.transactionHash,
    });
    expect(request.tokenType).toBe('platform');
    expect(request).not.toHaveProperty('_id');
  });

  test('requestPlatformToken: an amount above the limit is capped at the configured platform amount', async () => {
    const request = await service.requestPlatformToken({ ...REQUEST, amount: PLATFORM_TOKEN_AMOUNT * 2 });

    expect(blockchainClient.transferERC20Token).toHaveBeenCalledWith(
      PLATFORM_TOKEN_ADDRESS,
      WALLET,
      `${PLATFORM_TOKEN_AMOUNT}`,
    );
    expect(request.amount).toBe(PLATFORM_TOKEN_AMOUNT);

    const [stored] = Array.from(faucetRequests.store.values());
    expect(stored.amount).toBe(PLATFORM_TOKEN_AMOUNT);
    expect(stored.tokenType).toBe('platform');
  });

  test('requestGasToken: propagates a client failure unchanged and records nothing', async () => {
    blockchainClient.transferToken.mockImplementationOnce(async () => {
      throw new AppError({ message: 'Insufficient funds in faucet wallet', statusCode: 502, code: 'BLOCKCHAIN_ERROR' });
    });

    await expect(service.requestGasToken({ ...REQUEST })).rejects.toMatchObject({
      statusCode: 502,
      code: 'BLOCKCHAIN_ERROR',
      message: 'Insufficient funds in faucet wallet',
    });

    expect(faucetRequests.create).toHaveBeenCalledTimes(0);
    expect(faucetRequests.store.size).toBe(0);
  });

  test('requestHoldToken: propagates a repository failure raised after the transfer was sent', async () => {
    faucetRequests.create.mockImplementationOnce(async () => {
      throw new AppError({ message: 'Faucet request write failed', statusCode: 500, code: 'INTERNAL_ERROR' });
    });

    await expect(service.requestHoldToken({ ...REQUEST, amount: 25 })).rejects.toMatchObject({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Faucet request write failed',
    });

    // The service sends the transfer before persisting, so the client already recorded the call.
    expect(blockchainClient.transferERC20Token).toHaveBeenCalledTimes(1);
    expect(faucetRequests.store.size).toBe(0);
  });

  test('getRequestHistory: forwards the filter with pagination defaults and maps every request', async () => {
    await service.requestGasToken({ ...REQUEST });
    await service.requestHoldToken({ ...REQUEST, amount: 25 });

    const history = await service.getRequestHistory({ userId: REQUEST.userId });

    expect(faucetRequests.findAll).toHaveBeenCalledWith(
      { userId: REQUEST.userId },
      { limit: 50, offset: 0, sort: { createdAt: 'asc' } },
    );
    expect(history).toHaveLength(2);
    expect(history.map((item) => item.tokenType)).toEqual(['gas', 'hold']); // insertion order is stable in the fake
    for (const item of history) {
      expect(typeof item.id).toBe('string');
      expect(item.id).toHaveLength(24);
      expect(item.wallet).toBe(WALLET);
      expect(typeof item.createdAt).toBe('number');
      expect(item).not.toHaveProperty('_id');
    }
    expect(JSON.parse(JSON.stringify(history))).toEqual(history);
  });

  test('getRequestHistory: scopes the history to the requested user', async () => {
    await service.requestGasToken({ ...REQUEST });
    await service.requestHoldToken({ ...REQUEST, userId: 'user-2', amount: 25 });

    const history = await service.getRequestHistory({ userId: 'user-2' });

    expect(history).toHaveLength(1);
    expect(history[0].tokenType).toBe('hold');
  });

  test('getRequestHistory: forwards explicit pagination and accepts the 100 limit boundary', async () => {
    await service.requestGasToken({ ...REQUEST });

    const history = await service.getRequestHistory({ userId: REQUEST.userId, limit: 100, offset: 5 });

    expect(faucetRequests.findAll).toHaveBeenCalledWith(
      { userId: REQUEST.userId },
      { limit: 100, offset: 5, sort: { createdAt: 'asc' } },
    );
    expect(history).toHaveLength(0); // the fake applies offset 5 to a single stored request
  });

  test('getRequestHistory: rejects a limit above 100 before touching the repository', async () => {
    await expect(service.getRequestHistory({ userId: REQUEST.userId, limit: 101 })).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Limit cannot exceed 100',
    });

    expect(faucetRequests.findAll).toHaveBeenCalledTimes(0);
  });

  test('getRequestHistory: rejects a negative offset before touching the repository', async () => {
    await expect(service.getRequestHistory({ userId: REQUEST.userId, offset: -1 })).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Offset cannot be negative',
    });

    expect(faucetRequests.findAll).toHaveBeenCalledTimes(0);
  });

  test('getTokenUnlockTime: queries every token type and returns zeros when the user has no requests', async () => {
    const unlockTime = await service.getTokenUnlockTime({ userId: REQUEST.userId });

    expect(unlockTime).toEqual({ gasUnlockTime: 0, holdUnlockTime: 0, platformUnlockTime: 0 });
    expect(faucetRequests.findAll).toHaveBeenCalledTimes(3);
    expect(faucetRequests.findAll).toHaveBeenNthCalledWith(
      1,
      { userId: REQUEST.userId, tokenType: 'gas' },
      { limit: 1, sort: { createdAt: 'asc' } },
    );
    expect(faucetRequests.findAll).toHaveBeenNthCalledWith(
      2,
      { userId: REQUEST.userId, tokenType: 'hold' },
      { limit: 1, sort: { createdAt: 'asc' } },
    );
    expect(faucetRequests.findAll).toHaveBeenNthCalledWith(
      3,
      { userId: REQUEST.userId, tokenType: 'platform' },
      { limit: 1, sort: { createdAt: 'asc' } },
    );
  });

  test('getTokenUnlockTime: reports the delay only for the token types that were already requested', async () => {
    await service.requestGasToken({ ...REQUEST });

    const before = Math.floor(Date.now() / 1000);
    const unlockTime = await service.getTokenUnlockTime({ userId: REQUEST.userId });
    const after = Math.floor(Date.now() / 1000);

    expect(unlockTime.gasUnlockTime).toBeGreaterThanOrEqual(before + REQUEST_GAS_DELAY);
    expect(unlockTime.gasUnlockTime).toBeLessThanOrEqual(after + REQUEST_GAS_DELAY);
    expect(unlockTime.holdUnlockTime).toBe(0);
    expect(unlockTime.platformUnlockTime).toBe(0);
  });

  test('getTokenUnlockTime: every requested token type gets its own configured delay', async () => {
    await service.requestGasToken({ ...REQUEST });
    await service.requestHoldToken({ ...REQUEST, amount: 25 });
    await service.requestPlatformToken({ ...REQUEST, amount: 30 });

    const before = Math.floor(Date.now() / 1000);
    const unlockTime = await service.getTokenUnlockTime({ userId: REQUEST.userId });
    const after = Math.floor(Date.now() / 1000);

    expect(unlockTime.gasUnlockTime).toBeGreaterThanOrEqual(before + REQUEST_GAS_DELAY);
    expect(unlockTime.gasUnlockTime).toBeLessThanOrEqual(after + REQUEST_GAS_DELAY);
    expect(unlockTime.holdUnlockTime).toBeGreaterThanOrEqual(before + REQUEST_HOLD_DELAY);
    expect(unlockTime.holdUnlockTime).toBeLessThanOrEqual(after + REQUEST_HOLD_DELAY);
    expect(unlockTime.platformUnlockTime).toBeGreaterThanOrEqual(before + REQUEST_PLATFORM_DELAY);
    expect(unlockTime.platformUnlockTime).toBeLessThanOrEqual(after + REQUEST_PLATFORM_DELAY);
  });

  test('getTokenUnlockTime: other users requests do not unlock the caller', async () => {
    await service.requestGasToken({ ...REQUEST, userId: 'user-2' });

    const unlockTime = await service.getTokenUnlockTime({ userId: REQUEST.userId });

    expect(unlockTime).toEqual({ gasUnlockTime: 0, holdUnlockTime: 0, platformUnlockTime: 0 });
  });
});
