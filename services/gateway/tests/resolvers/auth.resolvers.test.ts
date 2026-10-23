/**
 * Isolated resolver tests for the auth GraphQL module.
 *
 * Resolvers are plain functions called directly with a fake GraphQLContext
 * (tests/fakes/context.fake.ts + clients.fake.ts), so nothing leaves the
 * process: no network, no database, no broker, no ports.
 *
 * authenticate and refreshToken are login-style mutations with no auth guard
 * (they must be reachable anonymously); revokeTokens and getUserTokens require
 * an authenticated user.
 */
import { describe, expect, test } from 'bun:test';
import type { GraphQLResolveInfo } from 'graphql';
import { ethers } from 'ethers';
import type { GraphQLContext } from '../../src/graphql/context/types';
import { createFakeContext, fakeUser, type FakeContext } from '../fakes/context.fake';
import { edenError, edenOk } from '../fakes/clients.fake';
import { authenticate } from '../../src/graphql/modules/auth/resolvers/mutations/authenticate';
import { refreshToken } from '../../src/graphql/modules/auth/resolvers/mutations/refreshToken';
import { revokeTokens } from '../../src/graphql/modules/auth/resolvers/mutations/revokeTokens';
import { getUserTokens } from '../../src/graphql/modules/auth/resolvers/queries/getUserTokens';

const INFO = {} as GraphQLResolveInfo;
const asContext = (fake: FakeContext) => fake as unknown as GraphQLContext;

// All-lowercase input: the resolver must forward the EIP-55 checksummed form.
const LOWERCASE_WALLET = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

describe('auth resolvers (unit, fake clients)', () => {
  describe('authenticate', () => {
    test('forwards the checksummed wallet, signature and timestamp and maps the token pair', async () => {
      const fake = createFakeContext();
      const checksummed = ethers.getAddress(LOWERCASE_WALLET);
      const upstream = {
        userId: 'user-1',
        wallet: checksummed,
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 900,
      };
      fake.clients.authClient.authenticate.post.mockImplementation(async () => edenOk(upstream));

      const result = await authenticate!(
        null as never,
        { input: { wallet: LOWERCASE_WALLET, signature: '0xsig', timestamp: 1700000000 } } as never,
        asContext(fake),
      INFO);

      expect(fake.clients.authClient.authenticate.post).toHaveBeenCalledTimes(1);
      expect(fake.clients.authClient.authenticate.post).toHaveBeenCalledWith({
        wallet: checksummed,
        signature: '0xsig',
        timestamp: 1700000000,
      });
      // Only the four mapped fields reach GraphQL; upstream extras (expiresIn) are dropped.
      expect(result).toEqual({
        userId: 'user-1',
        wallet: checksummed,
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
    });

    test('is reachable anonymously (no auth guard on the login mutation)', async () => {
      const fake = createFakeContext();
      fake.clients.authClient.authenticate.post.mockImplementation(async () =>
        edenOk({
          userId: 'user-1',
          wallet: fakeUser.wallet,
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
        }),
      );

      const result = await authenticate!(
        null as never,
        { input: { wallet: fakeUser.wallet, signature: '0xsig', timestamp: 1700000000 } } as never,
        asContext(fake),
      INFO);

      expect(result.userId).toBe('user-1');
    });

    test('maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext();
      fake.clients.authClient.authenticate.post.mockImplementation(async () =>
        edenError(401, 'UNAUTHORIZED', 'bad signature'),
      );

      await expect(
        authenticate!(
          null as never,
          { input: { wallet: fakeUser.wallet, signature: '0xsig', timestamp: 1700000000 } } as never,
          asContext(fake),
        INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
    });

    test('rejects a malformed wallet before calling the auth service', async () => {
      const fake = createFakeContext();

      await expect(
        authenticate!(
          null as never,
          { input: { wallet: 'not-an-address', signature: '0xsig', timestamp: 1700000000 } } as never,
          asContext(fake),
        INFO),
      ).rejects.toThrow();

      expect(fake.clients.authClient.authenticate.post).toHaveBeenCalledTimes(0);
    });
  });

  describe('refreshToken', () => {
    test('forwards the refresh token and returns the upstream payload', async () => {
      const fake = createFakeContext();
      const upstream = {
        userId: 'user-1',
        wallet: fakeUser.wallet,
        accessToken: 'access-token-2',
        refreshToken: 'refresh-token-2',
      };
      fake.clients.authClient.refreshToken.post.mockImplementation(async () => edenOk(upstream));

      const result = await refreshToken!(
        null as never,
        { input: { refreshToken: 'refresh-token' } } as never,
        asContext(fake),
      INFO);

      expect(fake.clients.authClient.refreshToken.post).toHaveBeenCalledWith({ refreshToken: 'refresh-token' });
      expect(result).toEqual(upstream);
    });

    test('maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext();
      fake.clients.authClient.refreshToken.post.mockImplementation(async () =>
        edenError(401, 'UNAUTHORIZED', 'refresh token expired'),
      );

      await expect(
        refreshToken!(null as never, { input: { refreshToken: 'stale' } } as never, asContext(fake), INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
    });
  });

  describe('revokeTokens', () => {
    test('scopes the revocation to the authenticated user and returns the result', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.authClient.revokeTokens.post.mockImplementation(async () => edenOk({ revokedCount: 2 }));

      const result = await revokeTokens!(
        null as never,
        { input: { tokenHashes: ['hash-1', 'hash-2'] } } as never,
        asContext(fake),
      INFO);

      expect(fake.clients.authClient.revokeTokens.post).toHaveBeenCalledWith({
        userId: fakeUser.id,
        tokenHashes: ['hash-1', 'hash-2'],
      });
      expect(result).toEqual({ revokedCount: 2 });
    });

    test('rejects an anonymous caller with 401 UNAUTHORIZED without calling the service', async () => {
      const fake = createFakeContext();

      await expect(
        revokeTokens!(null as never, { input: { tokenHashes: ['hash-1'] } } as never, asContext(fake), INFO),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

      expect(fake.clients.authClient.revokeTokens.post).toHaveBeenCalledTimes(0);
    });

    test('maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.authClient.revokeTokens.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(
        revokeTokens!(null as never, { input: { tokenHashes: ['hash-1'] } } as never, asContext(fake), INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
    });
  });

  describe('getUserTokens', () => {
    test('scopes the query to the authenticated user and returns the tokens', async () => {
      const fake = createFakeContext({ user: fakeUser });
      const tokens = [
        {
          tokenId: 'token-1',
          userId: fakeUser.id,
          tokenHash: 'hash-1',
          expiresAt: 1700000000,
          createdAt: 1690000000,
          updatedAt: 1690000000,
        },
      ];
      fake.clients.authClient.getUserTokens.post.mockImplementation(async () => edenOk(tokens));

      const result = await getUserTokens!(null as never, {} as never, asContext(fake), INFO);

      expect(fake.clients.authClient.getUserTokens.post).toHaveBeenCalledWith({ userId: fakeUser.id });
      expect(result).toEqual(tokens);
    });

    test('rejects an anonymous caller with 401 UNAUTHORIZED without calling the service', async () => {
      const fake = createFakeContext();

      await expect(getUserTokens!(null as never, {} as never, asContext(fake), INFO)).rejects.toMatchObject({
        statusCode: 401,
        code: 'UNAUTHORIZED',
      });

      expect(fake.clients.authClient.getUserTokens.post).toHaveBeenCalledTimes(0);
    });

    test('maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.authClient.getUserTokens.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(getUserTokens!(null as never, {} as never, asContext(fake), INFO)).rejects.toMatchObject({
        statusCode: 502,
        code: 'BAD_GATEWAY',
      });
    });
  });
});
