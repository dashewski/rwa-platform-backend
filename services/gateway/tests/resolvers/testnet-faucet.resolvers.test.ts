/**
 * Unit tests for the gateway testnet-faucet resolvers.
 *
 * All five resolvers require an authenticated caller (401 UNAUTHORIZED) and
 * forward userId/wallet (getUnlockTime and getHistory omit the wallet) to the
 * testnet-faucet service. The eden client is an in-memory mock — no network,
 * no database, no broker.
 */
import { describe, expect, test } from 'bun:test';
import type { GraphQLContext } from '../../src/graphql/context/types';
import { createFakeContext, fakeUser } from '../fakes/context.fake';
import { edenError, edenOk } from '../fakes/clients.fake';
import { requestGas } from '../../src/graphql/modules/testnet-faucet/resolvers/mutations/requestGas';
import { requestHold } from '../../src/graphql/modules/testnet-faucet/resolvers/mutations/requestHold';
import { requestPlatform } from '../../src/graphql/modules/testnet-faucet/resolvers/mutations/requestPlatform';
import { getHistory } from '../../src/graphql/modules/testnet-faucet/resolvers/queries/getHistory';
import { getUnlockTime } from '../../src/graphql/modules/testnet-faucet/resolvers/queries/getUnlockTime';

const REQUEST = {
  id: 'req-1',
  userId: 'user-1',
  wallet: fakeUser.wallet,
  tokenType: 'gas',
  amount: 10,
  transactionHash: '0xtx-1',
  createdAt: 1700000000,
};

const UNLOCK_TIME = { gasUnlockTime: 1, holdUnlockTime: 2, platformUnlockTime: 3 };

describe('gateway testnet-faucet resolvers (unit, fake eden clients)', () => {
  test('requestGas: rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
    const fake = createFakeContext();

    await expect(
      requestGas(null as never, { input: { amount: 10 } } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    expect(fake.clients.testnetFaucetClient.requestGas.post).not.toHaveBeenCalled();
  });

  test('requestGas: forwards userId/wallet/amount and returns the request', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.testnetFaucetClient.requestGas.post.mockImplementation(async () => edenOk(REQUEST));

    const result = await requestGas(
      null as never,
      { input: { amount: 10 } } as never,
      fake as unknown as GraphQLContext,
    );

    expect(fake.clients.testnetFaucetClient.requestGas.post).toHaveBeenCalledTimes(1);
    expect(fake.clients.testnetFaucetClient.requestGas.post).toHaveBeenCalledWith({
      userId: 'user-1',
      wallet: fakeUser.wallet,
      amount: 10,
    });
    expect(result).toEqual(REQUEST);
  });

  test('requestGas: maps an upstream failure to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.testnetFaucetClient.requestGas.post.mockImplementation(async () =>
      edenError(500, 'INTERNAL_ERROR', 'boom'),
    );

    await expect(
      requestGas(null as never, { input: { amount: 10 } } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
  });

  test('requestHold: rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
    const fake = createFakeContext();

    await expect(
      requestHold(null as never, { input: { amount: 10 } } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    expect(fake.clients.testnetFaucetClient.requestHold.post).not.toHaveBeenCalled();
  });

  test('requestHold: forwards userId/wallet/amount and returns the request', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.testnetFaucetClient.requestHold.post.mockImplementation(async () => edenOk(REQUEST));

    const result = await requestHold(
      null as never,
      { input: { amount: 10 } } as never,
      fake as unknown as GraphQLContext,
    );

    expect(fake.clients.testnetFaucetClient.requestHold.post).toHaveBeenCalledTimes(1);
    expect(fake.clients.testnetFaucetClient.requestHold.post).toHaveBeenCalledWith({
      userId: 'user-1',
      wallet: fakeUser.wallet,
      amount: 10,
    });
    expect(result).toEqual(REQUEST);
  });

  test('requestHold: maps an upstream failure to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.testnetFaucetClient.requestHold.post.mockImplementation(async () =>
      edenError(500, 'INTERNAL_ERROR', 'boom'),
    );

    await expect(
      requestHold(null as never, { input: { amount: 10 } } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
  });

  test('requestPlatform: rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
    const fake = createFakeContext();

    await expect(
      requestPlatform(null as never, { input: { amount: 10 } } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    expect(fake.clients.testnetFaucetClient.requestPlatform.post).not.toHaveBeenCalled();
  });

  test('requestPlatform: forwards userId/wallet/amount and returns the request', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.testnetFaucetClient.requestPlatform.post.mockImplementation(async () => edenOk(REQUEST));

    const result = await requestPlatform(
      null as never,
      { input: { amount: 10 } } as never,
      fake as unknown as GraphQLContext,
    );

    expect(fake.clients.testnetFaucetClient.requestPlatform.post).toHaveBeenCalledTimes(1);
    expect(fake.clients.testnetFaucetClient.requestPlatform.post).toHaveBeenCalledWith({
      userId: 'user-1',
      wallet: fakeUser.wallet,
      amount: 10,
    });
    expect(result).toEqual(REQUEST);
  });

  test('requestPlatform: maps an upstream failure to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.testnetFaucetClient.requestPlatform.post.mockImplementation(async () =>
      edenError(500, 'INTERNAL_ERROR', 'boom'),
    );

    await expect(
      requestPlatform(null as never, { input: { amount: 10 } } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
  });

  test('getUnlockTime: rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
    const fake = createFakeContext();

    await expect(getUnlockTime(null as never, {} as never, fake as unknown as GraphQLContext)).rejects.toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
    expect(fake.clients.testnetFaucetClient.getUnlockTime.post).not.toHaveBeenCalled();
  });

  test('getUnlockTime: forwards only the userId and returns the unlock times', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.testnetFaucetClient.getUnlockTime.post.mockImplementation(async () => edenOk(UNLOCK_TIME));

    const result = await getUnlockTime(null as never, {} as never, fake as unknown as GraphQLContext);

    expect(fake.clients.testnetFaucetClient.getUnlockTime.post).toHaveBeenCalledTimes(1);
    expect(fake.clients.testnetFaucetClient.getUnlockTime.post).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(result).toEqual(UNLOCK_TIME);
  });

  test('getUnlockTime: maps an upstream failure to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.testnetFaucetClient.getUnlockTime.post.mockImplementation(async () =>
      edenError(500, 'INTERNAL_ERROR', 'boom'),
    );

    await expect(getUnlockTime(null as never, {} as never, fake as unknown as GraphQLContext)).rejects.toMatchObject({
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  });

  test('getHistory: rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
    const fake = createFakeContext();

    await expect(
      getHistory(null as never, { pagination: { limit: 10, offset: 20 } } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    expect(fake.clients.testnetFaucetClient.getHistory.post).not.toHaveBeenCalled();
  });

  test('getHistory: forwards the userId and the pagination and returns the history', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.testnetFaucetClient.getHistory.post.mockImplementation(async () => edenOk([REQUEST]));

    const result = await getHistory(
      null as never,
      { pagination: { limit: 10, offset: 20 } } as never,
      fake as unknown as GraphQLContext,
    );

    expect(fake.clients.testnetFaucetClient.getHistory.post).toHaveBeenCalledTimes(1);
    expect(fake.clients.testnetFaucetClient.getHistory.post).toHaveBeenCalledWith({
      userId: 'user-1',
      pagination: { limit: 10, offset: 20 },
    });
    expect(result).toEqual([REQUEST]);
  });

  test('getHistory: sends limit/offset as undefined when pagination is omitted', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.testnetFaucetClient.getHistory.post.mockImplementation(async () => edenOk([REQUEST]));

    const result = await getHistory(null as never, {} as never, fake as unknown as GraphQLContext);

    // Faithful to src: the pagination object is always sent, fields undefined;
    // a `sort` field on the GraphQL PaginationInput is not forwarded.
    expect(fake.clients.testnetFaucetClient.getHistory.post).toHaveBeenCalledWith({
      userId: 'user-1',
      pagination: { limit: undefined, offset: undefined },
    });
    expect(result).toEqual([REQUEST]);
  });

  test('getHistory: maps an upstream failure to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.testnetFaucetClient.getHistory.post.mockImplementation(async () =>
      edenError(500, 'INTERNAL_ERROR', 'boom'),
    );

    await expect(
      getHistory(null as never, { pagination: { limit: 10, offset: 20 } } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
  });
});
