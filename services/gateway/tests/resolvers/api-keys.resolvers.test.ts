/**
 * Isolated resolver tests for the api-keys GraphQL module.
 *
 * Resolvers are plain functions called directly with a fake GraphQLContext
 * (tests/fakes/context.fake.ts + clients.fake.ts), so nothing leaves the
 * process: no network, no database, no broker, no ports.
 *
 * Ownership in this module is enforced against the upstream api-keys service
 * (getApiKeyById followed by a userId comparison), not through
 * services.ownership, so the ownership cases below assert that flow.
 */
import { describe, expect, test } from 'bun:test';
import type { GraphQLContext } from '../../src/graphql/context/types';
import { createFakeContext, fakeUser, type FakeContext } from '../fakes/context.fake';
import { edenError, edenOk } from '../fakes/clients.fake';
import { createApiKey } from '../../src/graphql/modules/api-keys/resolvers/mutations/createApiKey';
import { updateApiKey } from '../../src/graphql/modules/api-keys/resolvers/mutations/updateApiKey';
import { deleteApiKey } from '../../src/graphql/modules/api-keys/resolvers/mutations/deleteApiKey';
import { getApiKeys } from '../../src/graphql/modules/api-keys/resolvers/queries/getApiKeys';
import { getApiKey } from '../../src/graphql/modules/api-keys/resolvers/queries/getApiKey';

const asContext = (fake: FakeContext) => fake as unknown as GraphQLContext;

const KEY = {
  id: 'key-1',
  name: 'CI key',
  prefix: 'rwa_live',
  userId: fakeUser.id,
  wallet: fakeUser.wallet,
  createdAt: 1700000000,
  updatedAt: 1700000000,
};

const FOREIGN_KEY = { ...KEY, userId: 'user-2' };

describe('api-keys resolvers (unit, fake clients)', () => {
  describe('createApiKey', () => {
    test('forwards userId/wallet/name from the authenticated user and returns the created key', async () => {
      const fake = createFakeContext({ user: fakeUser });
      const created = {
        id: 'key-1',
        name: 'CI key',
        prefix: 'rwa_live',
        key: 'rwa_live_secret',
        createdAt: 1700000000,
      };
      fake.clients.apiKeysClient.createApiKey.post.mockImplementation(async () => edenOk(created));

      const result = await createApiKey(null as never, { input: { name: 'CI key' } } as never, asContext(fake));

      expect(fake.clients.apiKeysClient.createApiKey.post).toHaveBeenCalledTimes(1);
      expect(fake.clients.apiKeysClient.createApiKey.post).toHaveBeenCalledWith({
        userId: fakeUser.id,
        wallet: fakeUser.wallet,
        name: 'CI key',
      });
      expect(result).toEqual(created);
    });

    test('rejects an anonymous caller with 401 UNAUTHORIZED without calling the service', async () => {
      const fake = createFakeContext();

      await expect(
        createApiKey(null as never, { input: { name: 'CI key' } } as never, asContext(fake)),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

      expect(fake.clients.apiKeysClient.createApiKey.post).toHaveBeenCalledTimes(0);
    });

    test('maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.apiKeysClient.createApiKey.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(
        createApiKey(null as never, { input: { name: 'CI key' } } as never, asContext(fake)),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
    });
  });

  describe('updateApiKey', () => {
    const updated = { ...KEY, name: 'Renamed', updatedAt: 1700000001 };

    test('verifies ownership, forwards the update and returns the key', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.apiKeysClient.getApiKeyById.post.mockImplementation(async () => edenOk(KEY));
      fake.clients.apiKeysClient.updateApiKey.post.mockImplementation(async () => edenOk(updated));

      const result = await updateApiKey(
        null as never,
        { input: { id: 'key-1', name: 'Renamed' } } as never,
        asContext(fake),
      );

      expect(fake.clients.apiKeysClient.getApiKeyById.post).toHaveBeenCalledWith({ id: 'key-1' });
      expect(fake.clients.apiKeysClient.updateApiKey.post).toHaveBeenCalledWith({
        id: 'key-1',
        userId: fakeUser.id,
        name: 'Renamed',
      });
      expect(result).toEqual(updated);
    });

    test('rejects an anonymous caller with 401 UNAUTHORIZED without calling the service', async () => {
      const fake = createFakeContext();

      await expect(
        updateApiKey(null as never, { input: { id: 'key-1', name: 'Renamed' } } as never, asContext(fake)),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

      expect(fake.clients.apiKeysClient.getApiKeyById.post).toHaveBeenCalledTimes(0);
      expect(fake.clients.apiKeysClient.updateApiKey.post).toHaveBeenCalledTimes(0);
    });

    test("rejects updating another user's key with 404 NOT_FOUND and does not call update", async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.apiKeysClient.getApiKeyById.post.mockImplementation(async () => edenOk(FOREIGN_KEY));

      await expect(
        updateApiKey(null as never, { input: { id: 'key-2', name: 'Renamed' } } as never, asContext(fake)),
      ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });

      expect(fake.clients.apiKeysClient.updateApiKey.post).toHaveBeenCalledTimes(0);
    });

    test('maps a failed ownership lookup (5xx) to 502 BAD_GATEWAY and does not call update', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.apiKeysClient.getApiKeyById.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(
        updateApiKey(null as never, { input: { id: 'key-1', name: 'Renamed' } } as never, asContext(fake)),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });

      expect(fake.clients.apiKeysClient.updateApiKey.post).toHaveBeenCalledTimes(0);
    });

    test('keeps 404 NOT_FOUND when the ownership lookup answers with a non-5xx error', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.apiKeysClient.getApiKeyById.post.mockImplementation(async () =>
        edenError(404, 'NOT_FOUND', 'no key'),
      );

      await expect(
        updateApiKey(null as never, { input: { id: 'key-1', name: 'Renamed' } } as never, asContext(fake)),
      ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });

      expect(fake.clients.apiKeysClient.updateApiKey.post).toHaveBeenCalledTimes(0);
    });

    test('maps an upstream update failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.apiKeysClient.getApiKeyById.post.mockImplementation(async () => edenOk(KEY));
      fake.clients.apiKeysClient.updateApiKey.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(
        updateApiKey(null as never, { input: { id: 'key-1', name: 'Renamed' } } as never, asContext(fake)),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
    });
  });

  describe('deleteApiKey', () => {
    test('verifies ownership, scopes the delete to the caller and returns the deleted id', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.apiKeysClient.getApiKeyById.post.mockImplementation(async () => edenOk(KEY));
      fake.clients.apiKeysClient.deleteApiKey.post.mockImplementation(async () => edenOk({ id: 'key-1' }));

      const result = await deleteApiKey(null as never, { id: 'key-1' } as never, asContext(fake));

      expect(fake.clients.apiKeysClient.getApiKeyById.post).toHaveBeenCalledWith({ id: 'key-1' });
      expect(fake.clients.apiKeysClient.deleteApiKey.post).toHaveBeenCalledWith({
        id: 'key-1',
        userId: fakeUser.id,
      });
      expect(result).toBe('key-1');
    });

    test('rejects an anonymous caller with 401 UNAUTHORIZED without calling the service', async () => {
      const fake = createFakeContext();

      await expect(deleteApiKey(null as never, { id: 'key-1' } as never, asContext(fake))).rejects.toMatchObject({
        statusCode: 401,
        code: 'UNAUTHORIZED',
      });

      expect(fake.clients.apiKeysClient.deleteApiKey.post).toHaveBeenCalledTimes(0);
    });

    test("rejects deleting another user's key with 404 NOT_FOUND and does not call delete", async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.apiKeysClient.getApiKeyById.post.mockImplementation(async () => edenOk(FOREIGN_KEY));

      await expect(deleteApiKey(null as never, { id: 'key-2' } as never, asContext(fake))).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });

      expect(fake.clients.apiKeysClient.deleteApiKey.post).toHaveBeenCalledTimes(0);
    });

    test('maps a failed ownership lookup (5xx) to 502 BAD_GATEWAY and does not call delete', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.apiKeysClient.getApiKeyById.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(deleteApiKey(null as never, { id: 'key-1' } as never, asContext(fake))).rejects.toMatchObject({
        statusCode: 502,
        code: 'BAD_GATEWAY',
      });

      expect(fake.clients.apiKeysClient.deleteApiKey.post).toHaveBeenCalledTimes(0);
    });

    test('maps an upstream delete failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.apiKeysClient.getApiKeyById.post.mockImplementation(async () => edenOk(KEY));
      fake.clients.apiKeysClient.deleteApiKey.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(deleteApiKey(null as never, { id: 'key-1' } as never, asContext(fake))).rejects.toMatchObject({
        statusCode: 502,
        code: 'BAD_GATEWAY',
      });
    });
  });

  describe('getApiKeys', () => {
    test('scopes the query to the authenticated user and returns the list', async () => {
      const fake = createFakeContext({ user: fakeUser });
      const keys = [KEY, { ...KEY, id: 'key-2' }];
      fake.clients.apiKeysClient.getApiKeys.post.mockImplementation(async () => edenOk(keys));

      const result = await getApiKeys(null as never, {} as never, asContext(fake));

      expect(fake.clients.apiKeysClient.getApiKeys.post).toHaveBeenCalledTimes(1);
      expect(fake.clients.apiKeysClient.getApiKeys.post).toHaveBeenCalledWith({ userId: fakeUser.id });
      expect(result).toEqual(keys);
    });

    test('rejects an anonymous caller with 401 UNAUTHORIZED without calling the service', async () => {
      const fake = createFakeContext();

      await expect(getApiKeys(null as never, {} as never, asContext(fake))).rejects.toMatchObject({
        statusCode: 401,
        code: 'UNAUTHORIZED',
      });

      expect(fake.clients.apiKeysClient.getApiKeys.post).toHaveBeenCalledTimes(0);
    });

    test('maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.apiKeysClient.getApiKeys.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(getApiKeys(null as never, {} as never, asContext(fake))).rejects.toMatchObject({
        statusCode: 502,
        code: 'BAD_GATEWAY',
      });
    });
  });

  describe('getApiKey', () => {
    test('verifies ownership, then re-fetches scoped to the caller and returns the key', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.apiKeysClient.getApiKeyById.post.mockImplementation(async () => edenOk(KEY));
      fake.clients.apiKeysClient.getApiKey.post.mockImplementation(async () => edenOk(KEY));

      const result = await getApiKey(null as never, { id: 'key-1' } as never, asContext(fake));

      expect(fake.clients.apiKeysClient.getApiKeyById.post).toHaveBeenCalledWith({ id: 'key-1' });
      expect(fake.clients.apiKeysClient.getApiKey.post).toHaveBeenCalledWith({
        id: 'key-1',
        userId: fakeUser.id,
      });
      expect(result).toEqual(KEY);
    });

    test('rejects an anonymous caller with 401 UNAUTHORIZED without calling the service', async () => {
      const fake = createFakeContext();

      await expect(getApiKey(null as never, { id: 'key-1' } as never, asContext(fake))).rejects.toMatchObject({
        statusCode: 401,
        code: 'UNAUTHORIZED',
      });

      expect(fake.clients.apiKeysClient.getApiKeyById.post).toHaveBeenCalledTimes(0);
      expect(fake.clients.apiKeysClient.getApiKey.post).toHaveBeenCalledTimes(0);
    });

    test("rejects reading another user's key with 404 NOT_FOUND and does not re-fetch it", async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.apiKeysClient.getApiKeyById.post.mockImplementation(async () => edenOk(FOREIGN_KEY));

      await expect(getApiKey(null as never, { id: 'key-2' } as never, asContext(fake))).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });

      expect(fake.clients.apiKeysClient.getApiKey.post).toHaveBeenCalledTimes(0);
    });

    test('maps a failed ownership lookup (5xx) to 502 BAD_GATEWAY and does not re-fetch', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.apiKeysClient.getApiKeyById.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(getApiKey(null as never, { id: 'key-1' } as never, asContext(fake))).rejects.toMatchObject({
        statusCode: 502,
        code: 'BAD_GATEWAY',
      });

      expect(fake.clients.apiKeysClient.getApiKey.post).toHaveBeenCalledTimes(0);
    });

    test('maps an upstream failure of the scoped fetch to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.apiKeysClient.getApiKeyById.post.mockImplementation(async () => edenOk(KEY));
      fake.clients.apiKeysClient.getApiKey.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(getApiKey(null as never, { id: 'key-1' } as never, asContext(fake))).rejects.toMatchObject({
        statusCode: 502,
        code: 'BAD_GATEWAY',
      });
    });
  });
});
