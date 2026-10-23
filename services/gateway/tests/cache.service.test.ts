/**
 * Unit tests for the gateway CacheService. Redis and the company client are
 * replaced with in-memory fakes; no network, no database.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { CacheService } from '../src/services/cache.service';
import { edenError, edenOk, fakeEdenClient } from './fakes/clients.fake';
import type { CompanyClient } from '../src/clients/eden.clients';
import type { Redis } from 'ioredis';

const COMPANY = {
  id: 'company-1',
  name: 'Acme',
  createdAt: 1_700_000_000,
  updatedAt: 1_700_000_000,
  description: 'Acme Corp',
  ownerId: 'owner-1',
  socials: [],
  users: [],
};

describe('CacheService (unit, fake redis/company client)', () => {
  let redis: { get: ReturnType<typeof mock>; setex: ReturnType<typeof mock>; del: ReturnType<typeof mock> };
  let companyClient: ReturnType<typeof fakeEdenClient>;
  let service: CacheService;

  beforeEach(() => {
    redis = { get: mock(async () => null), setex: mock(async () => 'OK'), del: mock(async () => 1) };
    companyClient = fakeEdenClient({ getCompany: edenOk(COMPANY) });
    service = new CacheService(redis as unknown as Redis, companyClient as unknown as CompanyClient);
  });

  test('getCompany: returns cached data without calling the company client', async () => {
    redis.get.mockImplementation(async () => JSON.stringify(COMPANY));

    const response = await service.getCompany({ id: 'company-1' });

    expect(response).toEqual({ data: COMPANY, error: null } as never);
    expect(redis.get).toHaveBeenCalledWith('company:company-1');
    expect(companyClient.getCompany.post).toHaveBeenCalledTimes(0);
  });

  test('getCompany: on a cache miss fetches the company and caches it for 300 seconds', async () => {
    const response = await service.getCompany({ id: 'company-1' });

    expect(response).toEqual(edenOk(COMPANY) as never);
    expect(companyClient.getCompany.post).toHaveBeenCalledWith({ id: 'company-1' });
    expect(redis.setex).toHaveBeenCalledWith('company:company-1', 300, JSON.stringify(COMPANY));
  });

  test('getCompany: an upstream failure is returned as-is and not cached', async () => {
    companyClient.getCompany.post.mockImplementation(async () => edenError(404, 'NOT_FOUND', 'no company'));

    const response = await service.getCompany({ id: 'company-1' });

    expect(response.error).toMatchObject({ status: 404 });
    expect(redis.setex).toHaveBeenCalledTimes(0);
  });

  test('resetCompanyCache: deletes the company cache key', async () => {
    await service.resetCompanyCache('company-1');

    expect(redis.del).toHaveBeenCalledWith('company:company-1');
  });
});
