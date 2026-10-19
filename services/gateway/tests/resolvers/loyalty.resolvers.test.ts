/**
 * Unit tests for the gateway loyalty resolvers.
 *
 * Resolvers are plain functions called directly with a fake GraphQL context
 * ({ clients, user }). The eden clients are in-memory mocks — no network, no
 * database, no broker.
 *
 * Auth note: the two mutations require an authenticated caller (401
 * UNAUTHORIZED); the four queries are unauthenticated pass-throughs.
 */
import { describe, expect, test } from 'bun:test';
import type { GraphQLContext } from '../../src/graphql/context/types';
import { createFakeContext, fakeUser } from '../fakes/context.fake';
import { edenError, edenOk } from '../fakes/clients.fake';
import { createReferrerWithdrawTask } from '../../src/graphql/modules/loyalty/resolvers/mutations/createReferrerWithdrawTask';
import { registerReferral } from '../../src/graphql/modules/loyalty/resolvers/mutations/registerReferral';
import { getFees } from '../../src/graphql/modules/loyalty/resolvers/queries/getFees';
import { getReferrals } from '../../src/graphql/modules/loyalty/resolvers/queries/getReferrals';
import { getReferrerClaimHistory } from '../../src/graphql/modules/loyalty/resolvers/queries/getReferrerClaimHistory';
import { getReferrerWithdraws } from '../../src/graphql/modules/loyalty/resolvers/queries/getReferrerWithdraws';

const ROW = { id: 'row-1', userId: 'user-1' };

/** Full auth-service user records; wallets are read from these. */
const CALLER = { id: 'user-1', wallet: '0x2222222222222222222222222222222222222222' };
const REFERRER = { id: 'referrer-2', wallet: '0x3333333333333333333333333333333333333333' };

const FILTER_INPUT = {
  filter: { userId: 'user-1' },
  sort: { createdAt: 'desc' },
  limit: 10,
  offset: 20,
};

describe('gateway loyalty resolvers (unit, fake eden clients)', () => {
  test('getFees: forwards filter, sort and pagination and returns the data', async () => {
    const fake = createFakeContext();
    fake.clients.loyaltyClient.getFees.post.mockImplementation(async () => edenOk([ROW]));

    const result = await getFees(null as never, { input: FILTER_INPUT } as never, fake as unknown as GraphQLContext);

    expect(fake.clients.loyaltyClient.getFees.post).toHaveBeenCalledTimes(1);
    expect(fake.clients.loyaltyClient.getFees.post).toHaveBeenCalledWith(FILTER_INPUT);
    expect(result).toEqual([ROW]);
  });

  test('getFees: defaults filter/sort to {} when input is omitted and needs no caller', async () => {
    const fake = createFakeContext();
    fake.clients.loyaltyClient.getFees.post.mockImplementation(async () => edenOk([ROW]));

    const result = await getFees(null as never, {} as never, fake as unknown as GraphQLContext);

    expect(fake.clients.loyaltyClient.getFees.post).toHaveBeenCalledWith({
      filter: {},
      sort: {},
      limit: undefined,
      offset: undefined,
    });
    expect(result).toEqual([ROW]);
  });

  test('getFees: maps an upstream failure to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext();
    fake.clients.loyaltyClient.getFees.post.mockImplementation(async () => edenError(500, 'INTERNAL_ERROR', 'boom'));

    await expect(getFees(null as never, {} as never, fake as unknown as GraphQLContext)).rejects.toMatchObject({
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  });

  test('getReferrals: forwards filter, sort and pagination and returns the data', async () => {
    const fake = createFakeContext();
    fake.clients.loyaltyClient.getReferrals.post.mockImplementation(async () => edenOk([ROW]));

    const result = await getReferrals(
      null as never,
      { input: FILTER_INPUT } as never,
      fake as unknown as GraphQLContext,
    );

    expect(fake.clients.loyaltyClient.getReferrals.post).toHaveBeenCalledTimes(1);
    expect(fake.clients.loyaltyClient.getReferrals.post).toHaveBeenCalledWith(FILTER_INPUT);
    expect(result).toEqual([ROW]);
  });

  test('getReferrals: defaults filter/sort to {} when input is omitted and needs no caller', async () => {
    const fake = createFakeContext();
    fake.clients.loyaltyClient.getReferrals.post.mockImplementation(async () => edenOk([ROW]));

    const result = await getReferrals(null as never, {} as never, fake as unknown as GraphQLContext);

    expect(fake.clients.loyaltyClient.getReferrals.post).toHaveBeenCalledWith({
      filter: {},
      sort: {},
      limit: undefined,
      offset: undefined,
    });
    expect(result).toEqual([ROW]);
  });

  test('getReferrals: maps an upstream failure to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext();
    fake.clients.loyaltyClient.getReferrals.post.mockImplementation(async () =>
      edenError(500, 'INTERNAL_ERROR', 'boom'),
    );

    await expect(getReferrals(null as never, {} as never, fake as unknown as GraphQLContext)).rejects.toMatchObject({
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  });

  test('getReferrerWithdraws: forwards filter, sort and pagination and returns the data', async () => {
    const fake = createFakeContext();
    fake.clients.loyaltyClient.getReferrerWithdraws.post.mockImplementation(async () => edenOk([ROW]));

    const result = await getReferrerWithdraws(
      null as never,
      { input: FILTER_INPUT } as never,
      fake as unknown as GraphQLContext,
    );

    expect(fake.clients.loyaltyClient.getReferrerWithdraws.post).toHaveBeenCalledTimes(1);
    expect(fake.clients.loyaltyClient.getReferrerWithdraws.post).toHaveBeenCalledWith(FILTER_INPUT);
    expect(result).toEqual([ROW]);
  });

  test('getReferrerWithdraws: defaults filter/sort to {} when input is omitted and needs no caller', async () => {
    const fake = createFakeContext();
    fake.clients.loyaltyClient.getReferrerWithdraws.post.mockImplementation(async () => edenOk([ROW]));

    const result = await getReferrerWithdraws(null as never, {} as never, fake as unknown as GraphQLContext);

    expect(fake.clients.loyaltyClient.getReferrerWithdraws.post).toHaveBeenCalledWith({
      filter: {},
      sort: {},
      limit: undefined,
      offset: undefined,
    });
    expect(result).toEqual([ROW]);
  });

  test('getReferrerWithdraws: maps an upstream failure to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext();
    fake.clients.loyaltyClient.getReferrerWithdraws.post.mockImplementation(async () =>
      edenError(500, 'INTERNAL_ERROR', 'boom'),
    );

    await expect(
      getReferrerWithdraws(null as never, {} as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  });

  test('getReferrerClaimHistory: forwards filter, sort and pagination and returns the data', async () => {
    const fake = createFakeContext();
    fake.clients.loyaltyClient.getReferrerClaimHistory.post.mockImplementation(async () => edenOk([ROW]));

    const result = await getReferrerClaimHistory(
      null as never,
      { input: FILTER_INPUT } as never,
      fake as unknown as GraphQLContext,
    );

    expect(fake.clients.loyaltyClient.getReferrerClaimHistory.post).toHaveBeenCalledTimes(1);
    expect(fake.clients.loyaltyClient.getReferrerClaimHistory.post).toHaveBeenCalledWith(FILTER_INPUT);
    expect(result).toEqual([ROW]);
  });

  test('getReferrerClaimHistory: defaults filter/sort to {} when input is omitted and needs no caller', async () => {
    const fake = createFakeContext();
    fake.clients.loyaltyClient.getReferrerClaimHistory.post.mockImplementation(async () => edenOk([ROW]));

    const result = await getReferrerClaimHistory(null as never, {} as never, fake as unknown as GraphQLContext);

    expect(fake.clients.loyaltyClient.getReferrerClaimHistory.post).toHaveBeenCalledWith({
      filter: {},
      sort: {},
      limit: undefined,
      offset: undefined,
    });
    expect(result).toEqual([ROW]);
  });

  test('getReferrerClaimHistory: maps an upstream failure to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext();
    fake.clients.loyaltyClient.getReferrerClaimHistory.post.mockImplementation(async () =>
      edenError(500, 'INTERNAL_ERROR', 'boom'),
    );

    await expect(
      getReferrerClaimHistory(null as never, {} as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({
      statusCode: 502,
      code: 'BAD_GATEWAY',
    });
  });

  test('registerReferral: rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
    const fake = createFakeContext();

    await expect(
      registerReferral(null as never, { input: { referrerId: null } } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    expect(fake.clients.authClient.getUser.post).not.toHaveBeenCalled();
    expect(fake.clients.loyaltyClient.registerReferral.post).not.toHaveBeenCalled();
  });

  test('registerReferral: registers without a referrer when referrerId is omitted', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.authClient.getUser.post.mockImplementation(async () => edenOk(CALLER));
    fake.clients.loyaltyClient.registerReferral.post.mockImplementation(async () => edenOk(ROW));

    const result = await registerReferral(null as never, { input: {} } as never, fake as unknown as GraphQLContext);

    // Caller wallet is resolved from the auth service, not taken from the context user.
    expect(fake.clients.authClient.getUser.post).toHaveBeenCalledTimes(1);
    expect(fake.clients.authClient.getUser.post).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(fake.clients.loyaltyClient.registerReferral.post).toHaveBeenCalledWith({
      userWallet: CALLER.wallet,
      userId: 'user-1',
      referrerWallet: undefined,
      referrerId: undefined,
    });
    expect(result).toEqual(ROW);
  });

  test('registerReferral: resolves the referrer wallet from the auth service when referrerId is set', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.authClient.getUser.post
      .mockImplementationOnce(async () => edenOk(CALLER))
      .mockImplementationOnce(async () => edenOk(REFERRER));
    fake.clients.loyaltyClient.registerReferral.post.mockImplementation(async () => edenOk(ROW));

    const result = await registerReferral(
      null as never,
      { input: { referrerId: 'referrer-2' } } as never,
      fake as unknown as GraphQLContext,
    );

    // First the caller, then the referrer.
    expect(fake.clients.authClient.getUser.post).toHaveBeenCalledTimes(2);
    expect(fake.clients.authClient.getUser.post).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(fake.clients.authClient.getUser.post).toHaveBeenCalledWith({ userId: 'referrer-2' });
    expect(fake.clients.loyaltyClient.registerReferral.post).toHaveBeenCalledWith({
      userWallet: CALLER.wallet,
      userId: 'user-1',
      referrerWallet: REFERRER.wallet,
      referrerId: 'referrer-2',
    });
    expect(result).toEqual(ROW);
  });

  test('registerReferral: a failed referrer lookup is swallowed and the referral is registered without a wallet', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.authClient.getUser.post
      .mockImplementationOnce(async () => edenOk(CALLER))
      .mockImplementationOnce(async () => edenError(404, 'NOT_FOUND', 'no referrer'));
    fake.clients.loyaltyClient.registerReferral.post.mockImplementation(async () => edenOk(ROW));

    const result = await registerReferral(
      null as never,
      { input: { referrerId: 'referrer-2' } } as never,
      fake as unknown as GraphQLContext,
    );

    // Faithful to src: the referrer lookup error is ignored, not propagated.
    expect(fake.clients.loyaltyClient.registerReferral.post).toHaveBeenCalledWith({
      userWallet: CALLER.wallet,
      userId: 'user-1',
      referrerWallet: undefined,
      referrerId: 'referrer-2',
    });
    expect(result).toEqual(ROW);
  });

  test('registerReferral: maps a failed caller lookup to 502 BAD_GATEWAY without calling the loyalty service', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.authClient.getUser.post.mockImplementation(async () => edenError(500, 'INTERNAL_ERROR', 'boom'));

    await expect(
      registerReferral(null as never, { input: {} } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
    expect(fake.clients.loyaltyClient.registerReferral.post).not.toHaveBeenCalled();
  });

  test('registerReferral: maps a failed registration to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.authClient.getUser.post.mockImplementation(async () => edenOk(CALLER));
    fake.clients.loyaltyClient.registerReferral.post.mockImplementation(async () =>
      edenError(500, 'INTERNAL_ERROR', 'boom'),
    );

    await expect(
      registerReferral(null as never, { input: {} } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
  });

  test('createReferrerWithdrawTask: rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
    const fake = createFakeContext();

    await expect(
      createReferrerWithdrawTask(
        null as never,
        { input: { chainId: '56', tokenAddress: '0x4444', amount: '1000' } } as never,
        fake as unknown as GraphQLContext,
      ),
    ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    expect(fake.clients.authClient.getUser.post).not.toHaveBeenCalled();
    expect(fake.clients.loyaltyClient.createReferrerWithdrawTask.post).not.toHaveBeenCalled();
  });

  test('createReferrerWithdrawTask: fills the referrer wallet from auth and forwards the input', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.authClient.getUser.post.mockImplementation(async () => edenOk(CALLER));
    fake.clients.loyaltyClient.createReferrerWithdrawTask.post.mockImplementation(async () => edenOk(ROW));

    const result = await createReferrerWithdrawTask(
      null as never,
      { input: { chainId: '56', tokenAddress: '0x4444444444444444444444444444444444444444', amount: '1000' } } as never,
      fake as unknown as GraphQLContext,
    );

    expect(fake.clients.authClient.getUser.post).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(fake.clients.loyaltyClient.createReferrerWithdrawTask.post).toHaveBeenCalledWith({
      referrerWallet: CALLER.wallet,
      referrerId: 'user-1',
      chainId: '56',
      tokenAddress: '0x4444444444444444444444444444444444444444',
      amount: '1000',
    });
    expect(result).toEqual(ROW);
  });

  test('createReferrerWithdrawTask: maps a failed caller lookup to 502 BAD_GATEWAY without calling the loyalty service', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.authClient.getUser.post.mockImplementation(async () => edenError(500, 'INTERNAL_ERROR', 'boom'));

    await expect(
      createReferrerWithdrawTask(
        null as never,
        { input: { chainId: '56', tokenAddress: '0x4444', amount: '1000' } } as never,
        fake as unknown as GraphQLContext,
      ),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
    expect(fake.clients.loyaltyClient.createReferrerWithdrawTask.post).not.toHaveBeenCalled();
  });

  test('createReferrerWithdrawTask: maps a failed task creation to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.authClient.getUser.post.mockImplementation(async () => edenOk(CALLER));
    fake.clients.loyaltyClient.createReferrerWithdrawTask.post.mockImplementation(async () =>
      edenError(500, 'INTERNAL_ERROR', 'boom'),
    );

    await expect(
      createReferrerWithdrawTask(
        null as never,
        { input: { chainId: '56', tokenAddress: '0x4444', amount: '1000' } } as never,
        fake as unknown as GraphQLContext,
      ),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
  });
});
