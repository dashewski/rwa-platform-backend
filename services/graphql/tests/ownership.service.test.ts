/**
 * Unit tests for the shared OwnershipService.
 *
 * Redis, company client and auth client are replaced with fakes:
 * no network, no Redis, no database.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { OwnershipService } from '@shared/ownership/src/ownership.service';
import { edenError, edenOk, fakeEdenClient } from './fakes/clients.fake';
import type { AuthClient, CompanyClient } from '../src/clients/eden.clients';

const COMPANY = {
  id: 'company-1',
  ownerId: 'owner-1',
  users: [
    { userId: 'member-1', permissions: [{ permission: 'content', entity: '*' }] },
    { userId: 'member-2', permissions: [{ permission: 'deploy', entity: 'business-7' }] },
  ],
};

describe('OwnershipService (unit, fake redis/company/auth clients)', () => {
  let redis: { get: ReturnType<typeof mock>; setex: ReturnType<typeof mock>; del: ReturnType<typeof mock> };
  let companyClient: ReturnType<typeof fakeEdenClient>;
  let authClient: ReturnType<typeof fakeEdenClient>;
  let service: OwnershipService;

  beforeEach(() => {
    redis = {
      get: mock(async () => null),
      setex: mock(async () => 'OK'),
      del: mock(async () => 1),
    };
    companyClient = fakeEdenClient({ getCompany: edenOk(COMPANY) });
    authClient = fakeEdenClient({ getUser: edenOk({ id: 'owner-1', wallet: '0xowner-wallet' }) });
    service = new OwnershipService(
      redis as never,
      companyClient as unknown as CompanyClient,
      authClient as unknown as AuthClient,
    );
  });

  test('checkOwnership (user): allows the owner himself', async () => {
    await expect(
      service.checkOwnership({ userId: 'u1', ownerId: 'u1', ownerType: 'user', permission: 'content' }),
    ).resolves.toBeUndefined();

    expect(companyClient.getCompany.post).toHaveBeenCalledTimes(0);
  });

  test('checkOwnership (user): rejects a different user with 403 FORBIDDEN', async () => {
    await expect(
      service.checkOwnership({ userId: 'u1', ownerId: 'u2', ownerType: 'user', permission: 'content' }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  test('checkOwnership (company): allows the company owner', async () => {
    await expect(
      service.checkOwnership({ userId: 'owner-1', ownerId: 'company-1', ownerType: 'company', permission: 'deploy' }),
    ).resolves.toBeUndefined();

    expect(companyClient.getCompany.post).toHaveBeenCalledWith({ id: 'company-1' });
  });

  test('checkOwnership (company): member with wildcard permission passes for any entity', async () => {
    await expect(
      service.checkOwnership({
        userId: 'member-1',
        ownerId: 'company-1',
        ownerType: 'company',
        permission: 'content',
        entityId: 'business-9',
      }),
    ).resolves.toBeUndefined();
  });

  test('checkOwnership (company): member permission is entity-scoped when not wildcard', async () => {
    await expect(
      service.checkOwnership({
        userId: 'member-2',
        ownerId: 'company-1',
        ownerType: 'company',
        permission: 'deploy',
        entityId: 'business-7',
      }),
    ).resolves.toBeUndefined();

    await expect(
      service.checkOwnership({
        userId: 'member-2',
        ownerId: 'company-1',
        ownerType: 'company',
        permission: 'deploy',
        entityId: 'business-8',
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  test('checkOwnership (company): member with a different permission is rejected', async () => {
    await expect(
      service.checkOwnership({
        userId: 'member-1',
        ownerId: 'company-1',
        ownerType: 'company',
        permission: 'deploy',
        entityId: 'business-9',
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  test('checkOwnership (company): a user outside the company is rejected', async () => {
    await expect(
      service.checkOwnership({
        userId: 'stranger',
        ownerId: 'company-1',
        ownerType: 'company',
        permission: 'content',
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  test('checkOwnership (company): a failed company lookup maps to 502 UPSTREAM_ERROR', async () => {
    companyClient.getCompany.post.mockImplementation(async () => edenError(404, 'NOT_FOUND', 'company not found'));

    await expect(
      service.checkOwnership({ userId: 'owner-1', ownerId: 'company-1', ownerType: 'company', permission: 'content' }),
    ).rejects.toMatchObject({ statusCode: 502, code: 'UPSTREAM_ERROR' });
  });

  test('checkOwnership: an unknown ownerType is rejected with 403', async () => {
    await expect(
      service.checkOwnership({ userId: 'u1', ownerId: 'x', ownerType: 'dao', permission: 'content' }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  test('getOwnerWallet (user): returns the caller wallet without any client call', async () => {
    const wallet = await service.getOwnerWallet({
      user: { id: 'u1', wallet: '0xuser-wallet' },
      ownerId: 'u1',
      ownerType: 'user',
    });

    expect(wallet).toBe('0xuser-wallet');
    expect(companyClient.getCompany.post).toHaveBeenCalledTimes(0);
    expect(authClient.getUser.post).toHaveBeenCalledTimes(0);
  });

  test('getOwnerWallet (company): resolves the company owner wallet via auth', async () => {
    const wallet = await service.getOwnerWallet({
      user: { id: 'member-1', wallet: '0xmember-wallet' },
      ownerId: 'company-1',
      ownerType: 'company',
    });

    expect(wallet).toBe('0xowner-wallet');
    expect(authClient.getUser.post).toHaveBeenCalledWith({ userId: 'owner-1' });
  });

  test('getCompany: caches a successful lookup for 5 minutes', async () => {
    await service.checkOwnership({ userId: 'owner-1', ownerId: 'company-1', ownerType: 'company', permission: 'content' });

    expect(redis.setex).toHaveBeenCalledWith('company:company-1', 300, JSON.stringify(COMPANY));
  });

  test('getCompany: reads the cached value instead of calling the client', async () => {
    redis.get.mockImplementation(async () => JSON.stringify(COMPANY));

    await service.checkOwnership({ userId: 'owner-1', ownerId: 'company-1', ownerType: 'company', permission: 'content' });

    expect(companyClient.getCompany.post).toHaveBeenCalledTimes(0);
  });

  test('resetCompanyCache: deletes the company key', async () => {
    await service.resetCompanyCache('company-1');

    expect(redis.del).toHaveBeenCalledWith('company:company-1');
  });
});
