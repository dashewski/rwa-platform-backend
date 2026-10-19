/**
 * Unit tests for the gateway webhooks resolvers.
 *
 * Every resolver requires an authenticated caller (401 UNAUTHORIZED) and
 * forwards userId/wallet to the webhooks service in the request payload.
 * Ownership is enforced by the upstream getEndpoint call plus a userId
 * re-check in the resolver — ctx.services.ownership is not involved.
 *
 * The eden client is an in-memory mock — no network, no database, no broker.
 */
import { describe, expect, test } from 'bun:test';
import type { GraphQLContext } from '../../src/graphql/context/types';
import { createFakeContext, fakeUser } from '../fakes/context.fake';
import { edenError, edenOk } from '../fakes/clients.fake';
import { createWebhookEndpoint } from '../../src/graphql/modules/webhooks/resolvers/mutations/createWebhookEndpoint';
import { deleteWebhookEndpoint } from '../../src/graphql/modules/webhooks/resolvers/mutations/deleteWebhookEndpoint';
import { updateWebhookEndpoint } from '../../src/graphql/modules/webhooks/resolvers/mutations/updateWebhookEndpoint';
import { getWebhookEndpoint } from '../../src/graphql/modules/webhooks/resolvers/queries/getWebhookEndpoint';
import { getWebhookEndpoints } from '../../src/graphql/modules/webhooks/resolvers/queries/getWebhookEndpoints';

const FOREIGN_USER_ID = 'user-2';

const ENDPOINT = {
  id: 'wh-1',
  userId: 'user-1',
  wallet: fakeUser.wallet,
  url: 'https://example.com/hooks',
  events: ['business.deployed'],
  description: 'demo endpoint',
  active: true,
  rateLimitPerMinute: 60,
};

describe('gateway webhooks resolvers (unit, fake eden clients)', () => {
  test('getWebhookEndpoint: rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
    const fake = createFakeContext();

    await expect(
      getWebhookEndpoint(null as never, { id: 'wh-1' } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    expect(fake.clients.webhooksClient.getEndpoint.post).not.toHaveBeenCalled();
  });

  test('getWebhookEndpoint: forwards id/userId/wallet and returns the endpoint', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.webhooksClient.getEndpoint.post.mockImplementation(async () => edenOk(ENDPOINT));

    const result = await getWebhookEndpoint(null as never, { id: 'wh-1' } as never, fake as unknown as GraphQLContext);

    expect(fake.clients.webhooksClient.getEndpoint.post).toHaveBeenCalledTimes(1);
    expect(fake.clients.webhooksClient.getEndpoint.post).toHaveBeenCalledWith({
      id: 'wh-1',
      userId: 'user-1',
      wallet: fakeUser.wallet,
    });
    expect(result).toEqual(ENDPOINT);
  });

  test('getWebhookEndpoint: maps an endpoint owned by another user to 404 NOT_FOUND', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.webhooksClient.getEndpoint.post.mockImplementation(async () =>
      edenOk({ ...ENDPOINT, userId: FOREIGN_USER_ID }),
    );

    await expect(
      getWebhookEndpoint(null as never, { id: 'wh-1' } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  test('getWebhookEndpoint: maps an upstream failure to 404 NOT_FOUND', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.webhooksClient.getEndpoint.post.mockImplementation(async () =>
      edenError(404, 'NOT_FOUND', 'no endpoint'),
    );

    await expect(
      getWebhookEndpoint(null as never, { id: 'wh-1' } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  test('getWebhookEndpoint: maps an upstream 5xx failure to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.webhooksClient.getEndpoint.post.mockImplementation(async () =>
      edenError(500, 'INTERNAL_ERROR', 'boom'),
    );

    await expect(
      getWebhookEndpoint(null as never, { id: 'wh-1' } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
  });

  test('getWebhookEndpoints: rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
    const fake = createFakeContext();

    await expect(
      getWebhookEndpoints(null as never, {} as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    expect(fake.clients.webhooksClient.getEndpoints.post).not.toHaveBeenCalled();
  });

  test('getWebhookEndpoints: forwards userId/wallet and returns the list', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.webhooksClient.getEndpoints.post.mockImplementation(async () => edenOk([ENDPOINT]));

    const result = await getWebhookEndpoints(null as never, {} as never, fake as unknown as GraphQLContext);

    expect(fake.clients.webhooksClient.getEndpoints.post).toHaveBeenCalledTimes(1);
    expect(fake.clients.webhooksClient.getEndpoints.post).toHaveBeenCalledWith({
      userId: 'user-1',
      wallet: fakeUser.wallet,
    });
    expect(result).toEqual([ENDPOINT]);
  });

  test('getWebhookEndpoints: maps an upstream failure to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.webhooksClient.getEndpoints.post.mockImplementation(async () =>
      edenError(500, 'INTERNAL_ERROR', 'boom'),
    );

    await expect(
      getWebhookEndpoints(null as never, {} as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
  });

  test('createWebhookEndpoint: rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
    const fake = createFakeContext();

    await expect(
      createWebhookEndpoint(
        null as never,
        { input: { url: 'https://example.com/hooks', events: ['business.deployed'] } } as never,
        fake as unknown as GraphQLContext,
      ),
    ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    expect(fake.clients.webhooksClient.createEndpoint.post).not.toHaveBeenCalled();
  });

  test('createWebhookEndpoint: forwards the full input with userId/wallet', async () => {
    const fake = createFakeContext({ user: fakeUser });
    const created = { ...ENDPOINT, secret: 'whsec_1', createdAt: 1700000000 };
    fake.clients.webhooksClient.createEndpoint.post.mockImplementation(async () => edenOk(created));

    const result = await createWebhookEndpoint(
      null as never,
      {
        input: {
          url: 'https://example.com/hooks',
          events: ['business.deployed', 'pool.deployed'],
          description: 'demo endpoint',
          rateLimitPerMinute: 60,
        },
      } as never,
      fake as unknown as GraphQLContext,
    );

    expect(fake.clients.webhooksClient.createEndpoint.post).toHaveBeenCalledTimes(1);
    expect(fake.clients.webhooksClient.createEndpoint.post).toHaveBeenCalledWith({
      userId: 'user-1',
      wallet: fakeUser.wallet,
      url: 'https://example.com/hooks',
      events: ['business.deployed', 'pool.deployed'],
      description: 'demo endpoint',
      rateLimitPerMinute: 60,
    });
    expect(result).toEqual(created);
  });

  test('createWebhookEndpoint: optional fields are forwarded as undefined when omitted', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.webhooksClient.createEndpoint.post.mockImplementation(async () => edenOk(ENDPOINT));

    await createWebhookEndpoint(
      null as never,
      { input: { url: 'https://example.com/hooks', events: ['business.deployed'] } } as never,
      fake as unknown as GraphQLContext,
    );

    expect(fake.clients.webhooksClient.createEndpoint.post).toHaveBeenCalledWith({
      userId: 'user-1',
      wallet: fakeUser.wallet,
      url: 'https://example.com/hooks',
      events: ['business.deployed'],
      description: undefined,
      rateLimitPerMinute: undefined,
    });
  });

  test('createWebhookEndpoint: maps an upstream failure to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.webhooksClient.createEndpoint.post.mockImplementation(async () =>
      edenError(500, 'INTERNAL_ERROR', 'boom'),
    );

    await expect(
      createWebhookEndpoint(
        null as never,
        { input: { url: 'https://example.com/hooks', events: ['business.deployed'] } } as never,
        fake as unknown as GraphQLContext,
      ),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
  });

  test('updateWebhookEndpoint: rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
    const fake = createFakeContext();

    await expect(
      updateWebhookEndpoint(
        null as never,
        { input: { id: 'wh-1', url: 'https://new.example.com/hooks' } } as never,
        fake as unknown as GraphQLContext,
      ),
    ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    expect(fake.clients.webhooksClient.getEndpoint.post).not.toHaveBeenCalled();
    expect(fake.clients.webhooksClient.updateEndpoint.post).not.toHaveBeenCalled();
  });

  test('updateWebhookEndpoint: checks ownership upstream first, then forwards the update', async () => {
    const fake = createFakeContext({ user: fakeUser });
    const updated = { ...ENDPOINT, url: 'https://new.example.com/hooks', active: false };
    fake.clients.webhooksClient.getEndpoint.post.mockImplementation(async () => edenOk(ENDPOINT));
    fake.clients.webhooksClient.updateEndpoint.post.mockImplementation(async () => edenOk(updated));

    const result = await updateWebhookEndpoint(
      null as never,
      {
        input: {
          id: 'wh-1',
          url: 'https://new.example.com/hooks',
          events: ['business.deployed'],
          description: 'updated',
          active: false,
          rateLimitPerMinute: 30,
        },
      } as never,
      fake as unknown as GraphQLContext,
    );

    expect(fake.clients.webhooksClient.getEndpoint.post).toHaveBeenCalledWith({
      id: 'wh-1',
      userId: 'user-1',
      wallet: fakeUser.wallet,
    });
    expect(fake.clients.webhooksClient.updateEndpoint.post).toHaveBeenCalledTimes(1);
    expect(fake.clients.webhooksClient.updateEndpoint.post).toHaveBeenCalledWith({
      id: 'wh-1',
      userId: 'user-1',
      wallet: fakeUser.wallet,
      url: 'https://new.example.com/hooks',
      events: ['business.deployed'],
      description: 'updated',
      active: false,
      rateLimitPerMinute: 30,
    });
    expect(result).toEqual(updated);
  });

  test('updateWebhookEndpoint: an endpoint owned by another user gets 404 and is not updated', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.webhooksClient.getEndpoint.post.mockImplementation(async () =>
      edenOk({ ...ENDPOINT, userId: FOREIGN_USER_ID }),
    );

    await expect(
      updateWebhookEndpoint(
        null as never,
        { input: { id: 'wh-1', url: 'https://new.example.com/hooks' } } as never,
        fake as unknown as GraphQLContext,
      ),
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });

    expect(fake.clients.webhooksClient.updateEndpoint.post).not.toHaveBeenCalled();
    // Ownership is delegated to the upstream check, not ctx.services.ownership.
    expect(fake.services.ownership.checkOwnership).not.toHaveBeenCalled();
  });

  test('updateWebhookEndpoint: a failed ownership pre-check maps to 404 NOT_FOUND', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.webhooksClient.getEndpoint.post.mockImplementation(async () =>
      edenError(404, 'NOT_FOUND', 'no endpoint'),
    );

    await expect(
      updateWebhookEndpoint(
        null as never,
        { input: { id: 'wh-1', url: 'https://new.example.com/hooks' } } as never,
        fake as unknown as GraphQLContext,
      ),
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    expect(fake.clients.webhooksClient.updateEndpoint.post).not.toHaveBeenCalled();
  });

  test('updateWebhookEndpoint: a failed ownership pre-check (5xx) maps to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.webhooksClient.getEndpoint.post.mockImplementation(async () =>
      edenError(500, 'INTERNAL_ERROR', 'boom'),
    );

    await expect(
      updateWebhookEndpoint(
        null as never,
        { input: { id: 'wh-1', url: 'https://new.example.com/hooks' } } as never,
        fake as unknown as GraphQLContext,
      ),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
    expect(fake.clients.webhooksClient.updateEndpoint.post).not.toHaveBeenCalled();
  });

  test('updateWebhookEndpoint: maps a failed update to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.webhooksClient.getEndpoint.post.mockImplementation(async () => edenOk(ENDPOINT));
    fake.clients.webhooksClient.updateEndpoint.post.mockImplementation(async () =>
      edenError(500, 'INTERNAL_ERROR', 'boom'),
    );

    await expect(
      updateWebhookEndpoint(
        null as never,
        { input: { id: 'wh-1', url: 'https://new.example.com/hooks' } } as never,
        fake as unknown as GraphQLContext,
      ),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
  });

  test('deleteWebhookEndpoint: rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
    const fake = createFakeContext();

    await expect(
      deleteWebhookEndpoint(null as never, { id: 'wh-1' } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    expect(fake.clients.webhooksClient.getEndpoint.post).not.toHaveBeenCalled();
    expect(fake.clients.webhooksClient.deleteEndpoint.post).not.toHaveBeenCalled();
  });

  test('deleteWebhookEndpoint: checks ownership upstream first, then deletes and returns the id', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.webhooksClient.getEndpoint.post.mockImplementation(async () => edenOk(ENDPOINT));
    fake.clients.webhooksClient.deleteEndpoint.post.mockImplementation(async () => edenOk({ id: 'wh-1' }));

    const result = await deleteWebhookEndpoint(
      null as never,
      { id: 'wh-1' } as never,
      fake as unknown as GraphQLContext,
    );

    expect(fake.clients.webhooksClient.getEndpoint.post).toHaveBeenCalledWith({
      id: 'wh-1',
      userId: 'user-1',
      wallet: fakeUser.wallet,
    });
    expect(fake.clients.webhooksClient.deleteEndpoint.post).toHaveBeenCalledTimes(1);
    expect(fake.clients.webhooksClient.deleteEndpoint.post).toHaveBeenCalledWith({
      id: 'wh-1',
      userId: 'user-1',
      wallet: fakeUser.wallet,
    });
    expect(result).toBe('wh-1');
  });

  test('deleteWebhookEndpoint: an endpoint owned by another user gets 404 and is not deleted', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.webhooksClient.getEndpoint.post.mockImplementation(async () =>
      edenOk({ ...ENDPOINT, userId: FOREIGN_USER_ID }),
    );

    await expect(
      deleteWebhookEndpoint(null as never, { id: 'wh-1' } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });

    expect(fake.clients.webhooksClient.deleteEndpoint.post).not.toHaveBeenCalled();
  });

  test('deleteWebhookEndpoint: a failed ownership pre-check (5xx) maps to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.webhooksClient.getEndpoint.post.mockImplementation(async () =>
      edenError(500, 'INTERNAL_ERROR', 'boom'),
    );

    await expect(
      deleteWebhookEndpoint(null as never, { id: 'wh-1' } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });

    expect(fake.clients.webhooksClient.deleteEndpoint.post).not.toHaveBeenCalled();
  });

  test('deleteWebhookEndpoint: maps a failed delete to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.webhooksClient.getEndpoint.post.mockImplementation(async () => edenOk(ENDPOINT));
    fake.clients.webhooksClient.deleteEndpoint.post.mockImplementation(async () =>
      edenError(500, 'INTERNAL_ERROR', 'boom'),
    );

    await expect(
      deleteWebhookEndpoint(null as never, { id: 'wh-1' } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
  });
});
