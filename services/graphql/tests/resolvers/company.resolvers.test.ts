/**
 * Unit tests for the gateway `company` GraphQL resolvers.
 *
 * Resolvers are plain functions, so every test calls one directly with a fake
 * GraphQL context (createFakeContext): eden clients live under ctx.clients and
 * inner services under ctx.services. The company resolvers read company state
 * through services.cache (not a client), so that mock is the source of truth
 * for the owner/permission checks. Everything is in-memory — no network, no
 * database, no broker, no ports.
 */
import { describe, expect, test } from 'bun:test';
import type { GraphQLResolveInfo } from 'graphql';
import { AppError } from '@shared/errors/app-errors';
import type { GraphQLContext } from '../../src/graphql/context/types';
import { edenError, edenOk } from '../fakes/clients.fake';
import { createFakeContext, fakeUser } from '../fakes/context.fake';
import { addMember } from '../../src/graphql/modules/company/resolvers/mutations/addMember';
import { createCompany } from '../../src/graphql/modules/company/resolvers/mutations/createCompany';
import { deleteCompany } from '../../src/graphql/modules/company/resolvers/mutations/deleteCompany';
import { grantPermission } from '../../src/graphql/modules/company/resolvers/mutations/grantPermission';
import { removeMember } from '../../src/graphql/modules/company/resolvers/mutations/removeMember';
import { revokePermission } from '../../src/graphql/modules/company/resolvers/mutations/revokePermission';
import { updateCompany } from '../../src/graphql/modules/company/resolvers/mutations/updateCompany';
import { getCompanies } from '../../src/graphql/modules/company/resolvers/queries/getCompanies';
import { getCompany } from '../../src/graphql/modules/company/resolvers/queries/getCompany';

const INFO = {} as GraphQLResolveInfo;
const COMPANY = {
  id: 'company-1',
  name: 'Acme RWA',
  description: 'Tokenized real-world assets',
  ownerId: 'user-1',
  country: 'US',
  socials: [{ type: 'website', url: 'https://acme.example' }],
  users: [
    {
      id: 'member-1',
      userId: 'user-2',
      name: 'Bob',
      permissions: [{ id: 'perm-1', permission: 'content', entity: '*' }],
    },
  ],
  createdAt: 1_700_000_000,
  updatedAt: 1_700_000_000,
};

const MEMBER = {
  id: 'member-1',
  userId: 'user-2',
  name: 'Bob',
  createdAt: 1_700_000_100,
  updatedAt: 1_700_000_100,
};

const PERMISSION = {
  id: 'perm-1',
  permission: 'deploy',
  entity: 'business-7',
  createdAt: 1_700_000_200,
  updatedAt: 1_700_000_200,
};

const SOCIALS = [{ type: 'website', url: 'https://acme.example' }];

const CREATE_COMPANY_INPUT = {
  name: 'Acme RWA',
  description: 'Tokenized real-world assets',
  country: 'US',
  socials: SOCIALS,
};
const UPDATE_COMPANY_INPUT = {
  id: 'company-1',
  updateData: {
    name: 'Acme RWA II',
    description: 'Updated description',
    country: 'US',
    socials: SOCIALS,
  },
};
const ADD_MEMBER_INPUT = { companyId: 'company-1', userId: 'user-2', name: 'Bob' };
const REMOVE_MEMBER_INPUT = { id: 'member-1', companyId: 'company-1' };
const GRANT_PERMISSION_INPUT = {
  companyId: 'company-1',
  memberId: 'member-1',
  userId: 'user-2',
  permission: 'deploy',
  entity: 'business-7',
};
const REVOKE_PERMISSION_INPUT = { id: 'perm-1', companyId: 'company-1' };

describe('company resolvers (unit, fake context)', () => {
  describe('getCompany', () => {
    test('forwards the id to the ownership service and returns what it resolved', async () => {
      const fake = createFakeContext();
      fake.services.ownership.getCompany.mockImplementation(async () => COMPANY);

      const result = await getCompany!(null as never, { id: 'company-1' } as never, fake as unknown as GraphQLContext, INFO);

      expect(fake.services.ownership.getCompany).toHaveBeenCalledWith({ id: 'company-1' });
      expect(result).toEqual(COMPANY);
    });

    test('maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext();
      fake.services.ownership.getCompany.mockImplementation(async () => { throw new AppError({ message: 'Failed to get company data', statusCode: 502, code: 'UPSTREAM_ERROR' }); });

      await expect(
        getCompany!(null as never, { id: 'company-1' } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'UPSTREAM_ERROR', message: 'Failed to get company data' });
    });
  });

  describe('getCompanies', () => {
    test('forwards filter, sort and pagination to the client', async () => {
      const fake = createFakeContext();
      const input = { filter: { ownerId: 'user-1' }, sort: { createdAt: -1 }, limit: 5, offset: 10 };
      fake.clients.companyClient.getCompanies.post.mockImplementation(async () => edenOk([COMPANY]));

      const result = await getCompanies!(null as never, { input } as never, fake as unknown as GraphQLContext, INFO);

      expect(fake.clients.companyClient.getCompanies.post).toHaveBeenCalledWith({
        filter: input.filter,
        sort: input.sort,
        limit: 5,
        offset: 10,
      });
      expect(result).toEqual([COMPANY]);
    });

    test('defaults only the filter when input is omitted (sort stays undefined, as in src)', async () => {
      const fake = createFakeContext();
      fake.clients.companyClient.getCompanies.post.mockImplementation(async () => edenOk([]));

      const result = await getCompanies!(null as never, {} as never, fake as unknown as GraphQLContext, INFO);

      expect(fake.clients.companyClient.getCompanies.post).toHaveBeenCalledWith({
        filter: {},
        sort: undefined,
        limit: undefined,
        offset: undefined,
      });
      expect(result).toEqual([]);
    });

    test('maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext();
      fake.clients.companyClient.getCompanies.post.mockImplementation(async () => edenError(500));

      await expect(getCompanies!(null as never, {} as never, fake as unknown as GraphQLContext, INFO)).rejects.toMatchObject({
        statusCode: 502,
        code: 'BAD_GATEWAY',
        message: 'Failed to get companies',
      });
    });
  });

  describe('createCompany', () => {
    test('rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
      const fake = createFakeContext();

      await expect(
        createCompany!(null as never, { input: CREATE_COMPANY_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Authentication required' });

      expect(fake.services.validation.validateCountry).not.toHaveBeenCalled();
      expect(fake.clients.companyClient.createCompany.post).not.toHaveBeenCalled();
    });

    test('validates the input and forwards the create payload with the caller as owner', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.companyClient.createCompany.post.mockImplementation(async () =>
        edenOk({ ...COMPANY, socials: null }),
      );

      const result = await createCompany!(
        null as never,
        { input: CREATE_COMPANY_INPUT } as never,
        fake as unknown as GraphQLContext,
      INFO);

      expect(fake.services.validation.validateCountry).toHaveBeenCalledWith('US');
      expect(fake.services.validation.validateSocials).toHaveBeenCalledWith(SOCIALS);
      expect(fake.clients.companyClient.createCompany.post).toHaveBeenCalledWith({
        name: 'Acme RWA',
        description: 'Tokenized real-world assets',
        ownerId: 'user-1',
        country: 'US',
        socials: SOCIALS,
      });
      expect(result).toEqual({
        id: 'company-1',
        name: 'Acme RWA',
        description: 'Tokenized real-world assets',
        ownerId: 'user-1',
        country: 'US',
        socials: [],
        createdAt: 1_700_000_000,
        updatedAt: 1_700_000_000,
      });
    });

    test('defaults country/socials to undefined and the returned socials to an empty array', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.companyClient.createCompany.post.mockImplementation(async () =>
        edenOk({ ...COMPANY, socials: null }),
      );
      const input = { name: 'Acme RWA', description: 'Tokenized real-world assets' };

      const result = await createCompany!(null as never, { input } as never, fake as unknown as GraphQLContext, INFO);

      expect(fake.clients.companyClient.createCompany.post).toHaveBeenCalledWith({
        name: 'Acme RWA',
        description: 'Tokenized real-world assets',
        ownerId: 'user-1',
        country: undefined,
        socials: undefined,
      });
      expect(result).toMatchObject({ id: 'company-1', socials: [] });
    });

    test('propagates a country validation failure and never calls the client', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.services.validation.validateCountry.mockImplementationOnce(() => {
        throw new AppError({ message: 'Unsupported country', statusCode: 400, code: 'VALIDATION_ERROR' });
      });

      await expect(
        createCompany!(null as never, { input: CREATE_COMPANY_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });

      expect(fake.services.validation.validateSocials).not.toHaveBeenCalled();
      expect(fake.clients.companyClient.createCompany.post).not.toHaveBeenCalled();
    });

    test('maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.companyClient.createCompany.post.mockImplementation(async () => edenError(500));

      await expect(
        createCompany!(null as never, { input: CREATE_COMPANY_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to create company' });
    });
  });

  describe('updateCompany', () => {
    test('rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
      const fake = createFakeContext();

      await expect(
        updateCompany!(null as never, { input: UPDATE_COMPANY_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Authentication required' });

      expect(fake.services.ownership.getCompany).not.toHaveBeenCalled();
      expect(fake.clients.companyClient.updateCompany.post).not.toHaveBeenCalled();
    });

    test('validates, checks the owner, forwards the update and resets the cached company', async () => {
      const fake = createFakeContext({ user: fakeUser });
      const updated = { ...COMPANY, name: 'Acme RWA II', description: 'Updated description' };
      fake.services.ownership.getCompany.mockImplementation(async () => COMPANY);
      fake.clients.companyClient.updateCompany.post.mockImplementation(async () => edenOk(updated));

      const result = await updateCompany!(
        null as never,
        { input: UPDATE_COMPANY_INPUT } as never,
        fake as unknown as GraphQLContext,
      INFO);

      expect(fake.services.validation.validateCountry).toHaveBeenCalledWith('US');
      expect(fake.services.validation.validateSocials).toHaveBeenCalledWith(SOCIALS);
      expect(fake.services.ownership.getCompany).toHaveBeenCalledWith({ id: 'company-1' });
      expect(fake.clients.companyClient.updateCompany.post).toHaveBeenCalledWith({
        id: 'company-1',
        updateData: {
          name: 'Acme RWA II',
          description: 'Updated description',
          country: 'US',
          socials: SOCIALS,
        },
      });
      expect(fake.services.ownership.resetCompanyCache).toHaveBeenCalledWith('company-1');
      expect(result).toEqual({
        id: 'company-1',
        name: 'Acme RWA II',
        description: 'Updated description',
        ownerId: 'user-1',
        country: 'US',
        socials: SOCIALS,
        createdAt: 1_700_000_000,
        updatedAt: 1_700_000_000,
      });
    });

    test('rejects a non-owner and never calls the client', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.services.ownership.getCompany.mockImplementation(async () => ({ ...COMPANY, ownerId: 'user-2' }));

      await expect(
        updateCompany!(null as never, { input: UPDATE_COMPANY_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Only company owner can update company',
      });

      expect(fake.clients.companyClient.updateCompany.post).not.toHaveBeenCalled();
      expect(fake.services.ownership.resetCompanyCache).not.toHaveBeenCalled();
    });

    test('maps a failed company lookup to 502 UPSTREAM_ERROR (as in src)', async () => {
      // NOTE: src uses code UPSTREAM_ERROR here while deleteCompany/removeMember
      // map the same failure to BAD_GATEWAY — mirrored faithfully.
      const fake = createFakeContext({ user: fakeUser });
      fake.services.ownership.getCompany.mockImplementation(async () => { throw new AppError({ message: 'Failed to get company data', statusCode: 502, code: 'UPSTREAM_ERROR' }); });

      await expect(
        updateCompany!(null as never, { input: UPDATE_COMPANY_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'UPSTREAM_ERROR', message: 'Failed to get company data' });
    });

    test('maps a failed update to 502 UPSTREAM_ERROR and skips the cache reset', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.services.ownership.getCompany.mockImplementation(async () => COMPANY);
      fake.clients.companyClient.updateCompany.post.mockImplementation(async () => edenError(500));

      await expect(
        updateCompany!(null as never, { input: UPDATE_COMPANY_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'UPSTREAM_ERROR', message: 'Failed to update company' });

      expect(fake.services.ownership.resetCompanyCache).not.toHaveBeenCalled();
    });
  });

  describe('deleteCompany', () => {
    test('rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
      const fake = createFakeContext();

      await expect(
        deleteCompany!(null as never, { id: 'company-1' } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Authentication required' });

      expect(fake.services.ownership.getCompany).not.toHaveBeenCalled();
      expect(fake.clients.companyClient.deleteCompany.post).not.toHaveBeenCalled();
    });

    test('checks the owner, deletes and resets the cached company', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.services.ownership.getCompany.mockImplementation(async () => COMPANY);
      fake.clients.companyClient.deleteCompany.post.mockImplementation(async () => edenOk({ id: 'company-1' }));

      const result = await deleteCompany!(
        null as never,
        { id: 'company-1' } as never,
        fake as unknown as GraphQLContext,
      INFO);

      expect(fake.clients.companyClient.deleteCompany.post).toHaveBeenCalledWith({ id: 'company-1' });
      expect(fake.services.ownership.resetCompanyCache).toHaveBeenCalledWith('company-1');
      expect(result).toBe('company-1');
    });

    test('rejects a non-owner with 403 FORBIDDEN and never calls the client', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.services.ownership.getCompany.mockImplementation(async () => ({ ...COMPANY, ownerId: 'user-2' }));

      await expect(
        deleteCompany!(null as never, { id: 'company-1' } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Only company owner can delete company',
      });

      expect(fake.clients.companyClient.deleteCompany.post).not.toHaveBeenCalled();
      expect(fake.services.ownership.resetCompanyCache).not.toHaveBeenCalled();
    });

    test('maps a failed company lookup to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.services.ownership.getCompany.mockImplementation(async () => { throw new AppError({ message: 'Failed to get company data', statusCode: 502, code: 'UPSTREAM_ERROR' }); });

      await expect(
        deleteCompany!(null as never, { id: 'company-1' } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'UPSTREAM_ERROR', message: 'Failed to get company data' });
    });

    test('maps a failed delete to 502 BAD_GATEWAY and skips the cache reset', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.services.ownership.getCompany.mockImplementation(async () => COMPANY);
      fake.clients.companyClient.deleteCompany.post.mockImplementation(async () => edenError(500));

      await expect(
        deleteCompany!(null as never, { id: 'company-1' } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to delete company' });

      expect(fake.services.ownership.resetCompanyCache).not.toHaveBeenCalled();
    });
  });

  describe('addMember', () => {
    test('rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
      const fake = createFakeContext();

      await expect(
        addMember!(null as never, { input: ADD_MEMBER_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Authentication required' });

      expect(fake.services.ownership.getCompany).not.toHaveBeenCalled();
      expect(fake.clients.companyClient.addMember.post).not.toHaveBeenCalled();
    });

    test('checks the owner, adds the member and resets the cached company', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.services.ownership.getCompany.mockImplementation(async () => COMPANY);
      fake.clients.companyClient.addMember.post.mockImplementation(async () => edenOk(MEMBER));

      const result = await addMember!(
        null as never,
        { input: ADD_MEMBER_INPUT } as never,
        fake as unknown as GraphQLContext,
      INFO);

      expect(fake.services.ownership.getCompany).toHaveBeenCalledWith({ id: 'company-1' });
      expect(fake.clients.companyClient.addMember.post).toHaveBeenCalledWith({
        companyId: 'company-1',
        userId: 'user-2',
        name: 'Bob',
      });
      expect(fake.services.ownership.resetCompanyCache).toHaveBeenCalledWith('company-1');
      expect(result).toEqual(MEMBER);
    });

    test('rejects a non-owner and never calls the client', async () => {
      // NOTE: src throws 502 UPSTREAM_ERROR for a non-owner addMember (unlike the
      // 403 FORBIDDEN used for member/delete/permission mutations) — mirrored faithfully.
      const fake = createFakeContext({ user: fakeUser });
      fake.services.ownership.getCompany.mockImplementation(async () => ({ ...COMPANY, ownerId: 'user-2' }));

      await expect(
        addMember!(null as never, { input: ADD_MEMBER_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({
        statusCode: 502,
        code: 'UPSTREAM_ERROR',
        message: 'Only company owner can add members',
      });

      expect(fake.clients.companyClient.addMember.post).not.toHaveBeenCalled();
      expect(fake.services.ownership.resetCompanyCache).not.toHaveBeenCalled();
    });

    test('maps a failed company lookup to 502 UPSTREAM_ERROR (as in src)', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.services.ownership.getCompany.mockImplementation(async () => { throw new AppError({ message: 'Failed to get company data', statusCode: 502, code: 'UPSTREAM_ERROR' }); });

      await expect(
        addMember!(null as never, { input: ADD_MEMBER_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'UPSTREAM_ERROR', message: 'Failed to get company data' });
    });

    test('maps a failed add to 502 UPSTREAM_ERROR and skips the cache reset', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.services.ownership.getCompany.mockImplementation(async () => COMPANY);
      fake.clients.companyClient.addMember.post.mockImplementation(async () => edenError(500));

      await expect(
        addMember!(null as never, { input: ADD_MEMBER_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'UPSTREAM_ERROR', message: 'Failed to add member' });

      expect(fake.services.ownership.resetCompanyCache).not.toHaveBeenCalled();
    });
  });

  describe('removeMember', () => {
    test('rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
      const fake = createFakeContext();

      await expect(
        removeMember!(null as never, { input: REMOVE_MEMBER_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Authentication required' });

      expect(fake.clients.companyClient.removeMember.post).not.toHaveBeenCalled();
    });

    test('checks the owner and membership, then removes and resets the cache', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.services.ownership.getCompany.mockImplementation(async () => COMPANY);
      fake.clients.companyClient.removeMember.post.mockImplementation(async () => edenOk({ id: 'member-1' }));

      const result = await removeMember!(
        null as never,
        { input: REMOVE_MEMBER_INPUT } as never,
        fake as unknown as GraphQLContext,
      INFO);

      // src forwards only the member id to the client; companyId is used for the cache reset.
      expect(fake.clients.companyClient.removeMember.post).toHaveBeenCalledWith({ id: 'member-1' });
      expect(fake.services.ownership.resetCompanyCache).toHaveBeenCalledWith('company-1');
      expect(result).toBe('member-1');
    });

    test('rejects a non-owner with 403 FORBIDDEN', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.services.ownership.getCompany.mockImplementation(async () => ({ ...COMPANY, ownerId: 'user-2' }));

      await expect(
        removeMember!(null as never, { input: REMOVE_MEMBER_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Only company owner can remove members',
      });

      expect(fake.clients.companyClient.removeMember.post).not.toHaveBeenCalled();
    });

    test('rejects a member that does not belong to the company with 403 FORBIDDEN', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.services.ownership.getCompany.mockImplementation(async () => COMPANY);

      await expect(
        removeMember!(
          null as never,
          { input: { id: 'member-999', companyId: 'company-1' } } as never,
          fake as unknown as GraphQLContext,
        INFO),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Member does not belong to this company',
      });

      expect(fake.clients.companyClient.removeMember.post).not.toHaveBeenCalled();
    });

    test('maps a failed company lookup to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.services.ownership.getCompany.mockImplementation(async () => { throw new AppError({ message: 'Failed to get company data', statusCode: 502, code: 'UPSTREAM_ERROR' }); });

      await expect(
        removeMember!(null as never, { input: REMOVE_MEMBER_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'UPSTREAM_ERROR', message: 'Failed to get company data' });
    });

    test('maps a failed removal to 502 BAD_GATEWAY and skips the cache reset', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.services.ownership.getCompany.mockImplementation(async () => COMPANY);
      fake.clients.companyClient.removeMember.post.mockImplementation(async () => edenError(500));

      await expect(
        removeMember!(null as never, { input: REMOVE_MEMBER_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to remove member' });

      expect(fake.services.ownership.resetCompanyCache).not.toHaveBeenCalled();
    });
  });

  describe('grantPermission', () => {
    test('rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
      const fake = createFakeContext();

      await expect(
        grantPermission!(null as never, { input: GRANT_PERMISSION_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Authentication required' });

      expect(fake.clients.companyClient.grantPermission.post).not.toHaveBeenCalled();
    });

    test('checks the owner, grants the permission and resets the cached company', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.services.ownership.getCompany.mockImplementation(async () => COMPANY);
      fake.clients.companyClient.grantPermission.post.mockImplementation(async () => edenOk(PERMISSION));

      const result = await grantPermission!(
        null as never,
        { input: GRANT_PERMISSION_INPUT } as never,
        fake as unknown as GraphQLContext,
      INFO);

      expect(fake.clients.companyClient.grantPermission.post).toHaveBeenCalledWith({
        companyId: 'company-1',
        memberId: 'member-1',
        userId: 'user-2',
        permission: 'deploy',
        entity: 'business-7',
      });
      expect(fake.services.ownership.resetCompanyCache).toHaveBeenCalledWith('company-1');
      expect(result).toEqual(PERMISSION);
    });

    test('rejects a non-owner with 403 FORBIDDEN and never calls the client', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.services.ownership.getCompany.mockImplementation(async () => ({ ...COMPANY, ownerId: 'user-2' }));

      await expect(
        grantPermission!(null as never, { input: GRANT_PERMISSION_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Only company owner can grant permissions',
      });

      expect(fake.clients.companyClient.grantPermission.post).not.toHaveBeenCalled();
    });

    test('maps a failed company lookup to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.services.ownership.getCompany.mockImplementation(async () => { throw new AppError({ message: 'Failed to get company data', statusCode: 502, code: 'UPSTREAM_ERROR' }); });

      await expect(
        grantPermission!(null as never, { input: GRANT_PERMISSION_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'UPSTREAM_ERROR', message: 'Failed to get company data' });
    });

    test('maps a failed grant to 502 BAD_GATEWAY and skips the cache reset', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.services.ownership.getCompany.mockImplementation(async () => COMPANY);
      fake.clients.companyClient.grantPermission.post.mockImplementation(async () => edenError(500));

      await expect(
        grantPermission!(null as never, { input: GRANT_PERMISSION_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to grant permission' });

      expect(fake.services.ownership.resetCompanyCache).not.toHaveBeenCalled();
    });
  });

  describe('revokePermission', () => {
    test('rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
      const fake = createFakeContext();

      await expect(
        revokePermission!(null as never, { input: REVOKE_PERMISSION_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Authentication required' });

      expect(fake.clients.companyClient.revokePermission.post).not.toHaveBeenCalled();
    });

    test('checks the owner and permission ownership, then revokes and resets the cache', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.services.ownership.getCompany.mockImplementation(async () => COMPANY);
      fake.clients.companyClient.revokePermission.post.mockImplementation(async () => edenOk({ id: 'perm-1' }));

      const result = await revokePermission!(
        null as never,
        { input: REVOKE_PERMISSION_INPUT } as never,
        fake as unknown as GraphQLContext,
      INFO);

      // src forwards only the permission id to the client; companyId feeds the cache reset.
      expect(fake.clients.companyClient.revokePermission.post).toHaveBeenCalledWith({ id: 'perm-1' });
      expect(fake.services.ownership.resetCompanyCache).toHaveBeenCalledWith('company-1');
      expect(result).toBe('perm-1');
    });

    test('rejects a non-owner with 403 FORBIDDEN', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.services.ownership.getCompany.mockImplementation(async () => ({ ...COMPANY, ownerId: 'user-2' }));

      await expect(
        revokePermission!(null as never, { input: REVOKE_PERMISSION_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Only company owner can revoke permissions',
      });

      expect(fake.clients.companyClient.revokePermission.post).not.toHaveBeenCalled();
    });

    test('rejects a permission that does not belong to the company with 403 FORBIDDEN', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.services.ownership.getCompany.mockImplementation(async () => COMPANY);

      await expect(
        revokePermission!(
          null as never,
          { input: { id: 'perm-999', companyId: 'company-1' } } as never,
          fake as unknown as GraphQLContext,
        INFO),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Permission does not belong to this company',
      });

      expect(fake.clients.companyClient.revokePermission.post).not.toHaveBeenCalled();
    });

    test('maps a failed company lookup to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.services.ownership.getCompany.mockImplementation(async () => { throw new AppError({ message: 'Failed to get company data', statusCode: 502, code: 'UPSTREAM_ERROR' }); });

      await expect(
        revokePermission!(null as never, { input: REVOKE_PERMISSION_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'UPSTREAM_ERROR', message: 'Failed to get company data' });
    });

    test('maps a failed revoke to 502 BAD_GATEWAY and skips the cache reset', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.services.ownership.getCompany.mockImplementation(async () => COMPANY);
      fake.clients.companyClient.revokePermission.post.mockImplementation(async () => edenError(500));

      await expect(
        revokePermission!(null as never, { input: REVOKE_PERMISSION_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to revoke permission' });

      expect(fake.services.ownership.resetCompanyCache).not.toHaveBeenCalled();
    });
  });
});
