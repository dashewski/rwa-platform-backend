/**
 * Unit tests for the gateway ParentService (the rwa client is replaced with a
 * fake); no network, no database.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { ParentService } from '../src/services/parent.service';
import { edenError, edenOk, fakeEdenClient } from './fakes/clients.fake';
import type { RwaClient } from '../src/clients/eden.clients';

const BUSINESS = { id: 'business-1', ownerId: 'owner-1', ownerType: 'user' };
const POOL = { id: 'pool-1', businessId: 'business-1', ownerId: 'owner-1', ownerType: 'user' };

describe('ParentService (unit, fake rwa client)', () => {
  let rwaClient: ReturnType<typeof fakeEdenClient>;
  let service: ParentService;

  beforeEach(() => {
    rwaClient = fakeEdenClient({ getBusiness: edenOk(BUSINESS), getPool: edenOk(POOL) });
    service = new ParentService(rwaClient as unknown as RwaClient);
  });

  test('business parent: fetches the business and returns its owner chain', async () => {
    const info = await service.getParentInfo('business', 'business-1', 'user-9');

    expect(info).toEqual({ grandParentId: 'business-1', ownerId: 'owner-1', ownerType: 'user' });
    expect(rwaClient.getBusiness.post).toHaveBeenCalledWith({ id: 'business-1' });
  });

  test('pool parent: fetches the pool and uses its businessId as grandParentId', async () => {
    const info = await service.getParentInfo('pool', 'pool-1', 'user-9');

    expect(info).toEqual({ grandParentId: 'business-1', ownerId: 'owner-1', ownerType: 'user' });
    expect(rwaClient.getPool.post).toHaveBeenCalledWith({ id: 'pool-1' });
  });

  test('user parent: the user is his own parent', async () => {
    const info = await service.getParentInfo('user', 'user-9', 'user-9');

    expect(info).toEqual({ grandParentId: 'user-9', ownerId: 'user-9', ownerType: 'user' });
  });

  test('user parent: mismatched parentId/userId is rejected with 400 VALIDATION_ERROR', async () => {
    await expect(service.getParentInfo('user', 'user-9', 'someone-else')).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  test('business parent: an upstream failure maps to 502 UPSTREAM_ERROR', async () => {
    rwaClient.getBusiness.post.mockImplementation(async () => edenError(500));

    await expect(service.getParentInfo('business', 'business-1', 'u')).rejects.toMatchObject({
      statusCode: 502,
      code: 'UPSTREAM_ERROR',
    });
  });

  test('pool parent: an upstream failure maps to 502 UPSTREAM_ERROR', async () => {
    rwaClient.getPool.post.mockImplementation(async () => edenError(404));

    await expect(service.getParentInfo('pool', 'pool-1', 'u')).rejects.toMatchObject({
      statusCode: 502,
      code: 'UPSTREAM_ERROR',
    });
  });

  test('an unknown parent type is rejected with 400 VALIDATION_ERROR', async () => {
    await expect(service.getParentInfo('company', 'x', 'u')).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
  });
});
