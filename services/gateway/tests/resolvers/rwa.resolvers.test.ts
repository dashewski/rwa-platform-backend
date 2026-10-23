/**
 * Unit tests for the rwa module resolvers (queries, mutations, subscription).
 *
 * Resolvers are plain functions invoked with a fake GraphQLContext built from
 * tests/fakes/* (fake eden treaty clients + fake inner services): no network,
 * no database, no broker. Run with `bun test` from services/gateway.
 */
import { describe, expect, test } from 'bun:test';
import type { GraphQLResolveInfo } from 'graphql';
import { GraphQLError } from 'graphql';
import { AppError } from '@shared/errors/app-errors';
import type { GraphQLContext } from '../../src/graphql/context/types';
import { createFakeContext, fakeUser } from '../fakes/context.fake';
import { edenError, edenOk } from '../fakes/clients.fake';

import { getBusiness } from '../../src/graphql/modules/rwa/resolvers/queries/getBusiness';
import { getBusinesses } from '../../src/graphql/modules/rwa/resolvers/queries/getBusinesses';
import { getPool } from '../../src/graphql/modules/rwa/resolvers/queries/getPool';
import { getPools } from '../../src/graphql/modules/rwa/resolvers/queries/getPools';

import { createBusiness } from '../../src/graphql/modules/rwa/resolvers/mutations/business/createBusiness';
import { createBusinessWithAI } from '../../src/graphql/modules/rwa/resolvers/mutations/business/createBusinessWithAI';
import { editBusiness } from '../../src/graphql/modules/rwa/resolvers/mutations/business/editBusiness';
import { updateBusinessRiskScore } from '../../src/graphql/modules/rwa/resolvers/mutations/business/updateBusinessRiskScore';
import { requestBusinessApprovalSignatures } from '../../src/graphql/modules/rwa/resolvers/mutations/business/requestBusinessApprovalSignatures';
import { rejectBusinessApprovalSignatures } from '../../src/graphql/modules/rwa/resolvers/mutations/business/rejectBusinessApprovalSignatures';

import { createPool } from '../../src/graphql/modules/rwa/resolvers/mutations/pool/createPool';
import { createPoolWithAI } from '../../src/graphql/modules/rwa/resolvers/mutations/pool/createPoolWithAI';
import { editPool } from '../../src/graphql/modules/rwa/resolvers/mutations/pool/editPool';
import { updatePoolRiskScore } from '../../src/graphql/modules/rwa/resolvers/mutations/pool/updatePoolRiskScore';
import { requestPoolApprovalSignatures } from '../../src/graphql/modules/rwa/resolvers/mutations/pool/requestPoolApprovalSignatures';
import { rejectPoolApprovalSignatures } from '../../src/graphql/modules/rwa/resolvers/mutations/pool/rejectPoolApprovalSignatures';

import { poolDeployed } from '../../src/graphql/modules/rwa/resolvers/subscriptions/poolDeployed';

const INFO = {} as GraphQLResolveInfo;
const BUSINESS = {
  id: 'business-1',
  chainId: '8453',
  name: 'Solar Farm SPV',
  ownerId: 'owner-1',
  ownerType: 'company',
  tokenAddress: '0xrwa-token',
  createdAt: 1_700_000_000,
  updatedAt: 1_700_000_000,
  paused: false,
  riskScoreEvaluationProcess: false,
  socials: [],
};

const POOL = {
  id: 'pool-1',
  businessId: 'business-1',
  ownerId: 'owner-1',
  ownerType: 'company',
  name: 'Senior tranche',
  chainId: '8453',
  createdAt: 1_700_000_000,
  updatedAt: 1_700_000_000,
  rwaAddress: '0xrwa-token',
  paused: false,
  allowEntryBurn: false,
  awaitCompletionExpired: false,
  fixedSell: false,
  floatingOutTranchesTimestamps: false,
  floatingTimestampOffset: 0,
  incomingTranches: [],
  outgoingTranches: [],
  isFullyReturned: false,
  isTargetReached: false,
  lastCompletedIncomingTranche: 0,
  riskScoreEvaluationProcess: false,
};

const LIST_INPUT = {
  filter: { ownerId: 'owner-1' },
  sort: { field: 'createdAt', direction: 'desc' },
  limit: 10,
  offset: 20,
};

const SOCIALS = [{ type: 'website', url: 'https://solar.example.com' }];

const CREATE_BUSINESS_INPUT = {
  name: 'Solar Farm SPV',
  ownerId: 'owner-1',
  ownerType: 'company',
  chainId: '8453',
  description: 'Tokenized solar farm',
  tags: ['renewable', 'solar'],
  country: 'DE',
  businessType: 'growth',
  socials: SOCIALS,
};

const CREATE_BUSINESS_WITH_AI_INPUT = {
  description: 'Tokenized solar farm in Portugal',
  ownerId: 'owner-1',
  ownerType: 'company',
  chainId: '8453',
};

const EDIT_BUSINESS_INPUT = {
  id: 'business-1',
  updateData: {
    chainId: '8453',
    name: 'Solar Farm SPV II',
    description: 'Updated description',
    tags: ['renewable'],
    country: 'PT',
    businessType: 'startup',
    socials: SOCIALS,
  },
};

const REQUEST_BUSINESS_SIGNATURES_INPUT = {
  id: 'business-1',
  // Both wallet fields are deprecated/ignored by the resolver; they must not win over the derived values.
  ownerWallet: '0xinput-owner',
  deployerWallet: '0xinput-deployer',
  createRWAFee: '5',
};

const CREATE_POOL_INPUT = {
  name: 'Senior tranche',
  businessId: 'business-1',
  entryFeePercent: '1.5',
  exitFeePercent: '1.5',
  expectedHoldAmount: '1000000',
  expectedRwaAmount: '1000000',
  fixedSell: true,
  description: 'First pool of the business',
  tags: ['fixed-income'],
};

const CREATE_POOL_WITH_AI_INPUT = {
  description: 'AI generated pool for the solar farm',
  businessId: 'business-1',
};

const EDIT_POOL_INPUT = {
  id: 'pool-1',
  updateData: {
    chainId: '8453',
    name: 'Senior tranche II',
    entryFeePercent: '2',
    description: 'Updated pool',
    tags: ['fixed-income'],
  },
};

const REQUEST_POOL_SIGNATURES_INPUT = {
  id: 'pool-1',
  // Both wallet fields are deprecated/ignored by the resolver; they must not win over the derived values.
  ownerWallet: '0xinput-owner',
  deployerWallet: '0xinput-deployer',
  createPoolFeeRatio: '0.3',
};

describe('rwa resolvers (unit, fake clients/services)', () => {
  describe('Query.getBusiness', () => {
    test('forwards the id and returns the fetched business', async () => {
      const fake = createFakeContext();
      fake.clients.rwaClient.getBusiness.post.mockImplementation(async () => edenOk(BUSINESS));

      const result = await getBusiness!(null as never, { id: 'business-1' } as never, fake as unknown as GraphQLContext, INFO);

      expect(fake.clients.rwaClient.getBusiness.post).toHaveBeenCalledWith({ id: 'business-1' });
      expect(result).toEqual(BUSINESS);
    });

    test('maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext();
      fake.clients.rwaClient.getBusiness.post.mockImplementation(async () =>
        edenError(404, 'NOT_FOUND', 'no business'),
      );

      await expect(
        getBusiness!(null as never, { id: 'missing' } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
    });
  });

  describe('Query.getBusinesses', () => {
    test('forwards filter/sort/pagination and returns the list', async () => {
      const fake = createFakeContext();
      fake.clients.rwaClient.getBusinesses.post.mockImplementation(async () => edenOk([BUSINESS]));

      const result = await getBusinesses!(
        null as never,
        { input: LIST_INPUT } as never,
        fake as unknown as GraphQLContext,
      INFO);

      expect(fake.clients.rwaClient.getBusinesses.post).toHaveBeenCalledWith({
        filter: LIST_INPUT.filter,
        sort: LIST_INPUT.sort,
        limit: 10,
        offset: 20,
      });
      expect(result).toEqual([BUSINESS]);
    });

    test('maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext();
      fake.clients.rwaClient.getBusinesses.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(
        getBusinesses!(null as never, { input: LIST_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
    });
  });

  describe('Query.getPool', () => {
    test('forwards the id and returns the fetched pool', async () => {
      const fake = createFakeContext();
      fake.clients.rwaClient.getPool.post.mockImplementation(async () => edenOk(POOL));

      const result = await getPool!(null as never, { id: 'pool-1' } as never, fake as unknown as GraphQLContext, INFO);

      expect(fake.clients.rwaClient.getPool.post).toHaveBeenCalledWith({ id: 'pool-1' });
      expect(result).toEqual(POOL);
    });

    test('maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext();
      fake.clients.rwaClient.getPool.post.mockImplementation(async () => edenError(404, 'NOT_FOUND', 'no pool'));

      await expect(
        getPool!(null as never, { id: 'missing' } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
    });
  });

  describe('Query.getPools', () => {
    test('forwards filter/sort/pagination and returns the list', async () => {
      const fake = createFakeContext();
      fake.clients.rwaClient.getPools.post.mockImplementation(async () => edenOk([POOL]));

      const result = await getPools!(null as never, { input: LIST_INPUT } as never, fake as unknown as GraphQLContext, INFO);

      expect(fake.clients.rwaClient.getPools.post).toHaveBeenCalledWith({
        filter: LIST_INPUT.filter,
        sort: LIST_INPUT.sort,
        limit: 10,
        offset: 20,
      });
      expect(result).toEqual([POOL]);
    });

    test('maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext();
      fake.clients.rwaClient.getPools.post.mockImplementation(async () => edenError(500, 'INTERNAL_ERROR', 'boom'));

      await expect(
        getPools!(null as never, { input: LIST_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
    });
  });

  describe('Mutation.createBusiness', () => {
    test('rejects an anonymous caller with 401 UNAUTHORIZED and calls nothing', async () => {
      const fake = createFakeContext();

      await expect(
        createBusiness!(null as never, { input: CREATE_BUSINESS_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

      expect(fake.services.validation.validateCountry).toHaveBeenCalledTimes(0);
      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledTimes(0);
      expect(fake.clients.rwaClient.createBusiness.post).toHaveBeenCalledTimes(0);
    });

    test('validates, checks ownership and forwards the mapped payload', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.createBusiness.post.mockImplementation(async () => edenOk(BUSINESS));

      const result = await createBusiness!(
        null as never,
        { input: CREATE_BUSINESS_INPUT } as never,
        fake as unknown as GraphQLContext,
      INFO);

      expect(fake.services.validation.validateCountry).toHaveBeenCalledWith('DE');
      expect(fake.services.validation.validateSocials).toHaveBeenCalledWith(SOCIALS);
      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
        userId: fakeUser.id,
        ownerId: 'owner-1',
        ownerType: 'company',
        permission: 'content',
      });
      expect(fake.clients.rwaClient.createBusiness.post).toHaveBeenCalledWith({
        name: 'Solar Farm SPV',
        ownerId: 'owner-1',
        ownerType: 'company',
        chainId: '8453',
        description: 'Tokenized solar farm',
        tags: ['renewable', 'solar'],
        country: 'DE',
        businessType: 'growth',
        socials: SOCIALS,
      });
      expect(result).toEqual(BUSINESS);
    });

    test('forwards omitted optional fields as explicit undefined', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.createBusiness.post.mockImplementation(async () => edenOk(BUSINESS));
      const input = {
        name: 'Minimal business',
        ownerId: 'owner-1',
        ownerType: 'company',
        chainId: '8453',
        description: 'No optional fields',
        tags: ['minimal'],
      };

      await createBusiness!(null as never, { input } as never, fake as unknown as GraphQLContext, INFO);

      const payload = fake.clients.rwaClient.createBusiness.post.mock.calls[0][0] as Record<string, unknown>;
      // `input.country ?? undefined` etc. keeps the keys on the payload with an undefined value.
      expect(Object.keys(payload)).toContain('country');
      expect(payload.country).toBeUndefined();
      expect(payload.businessType).toBeUndefined();
      expect(payload.socials).toBeUndefined();
    });

    test('propagates a validation failure and never calls the client', async () => {
      const fake = createFakeContext({ user: fakeUser });
      // The real ValidationService throws GraphQLError (see validation.service.test.ts);
      // the resolver must let it bubble up unchanged.
      fake.services.validation.validateCountry.mockImplementation(() => {
        throw new GraphQLError('Invalid country code: "XX". Must be ISO 3166-1 alpha-2');
      });

      await expect(
        createBusiness!(null as never, { input: CREATE_BUSINESS_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toThrow('Invalid country code');

      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledTimes(0);
      expect(fake.clients.rwaClient.createBusiness.post).toHaveBeenCalledTimes(0);
    });

    test('propagates an ownership rejection and never calls the client', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.services.ownership.checkOwnership.mockImplementation(async () => {
        throw new AppError({ message: 'User does not have permission', statusCode: 403, code: 'FORBIDDEN' });
      });

      await expect(
        createBusiness!(null as never, { input: CREATE_BUSINESS_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

      expect(fake.clients.rwaClient.createBusiness.post).toHaveBeenCalledTimes(0);
    });

    test('maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.createBusiness.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(
        createBusiness!(null as never, { input: CREATE_BUSINESS_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });

      // The ownership check already passed before the upstream call was attempted.
      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledTimes(1);
    });
  });

  describe('Mutation.createBusinessWithAI', () => {
    test('rejects an anonymous caller with 401 UNAUTHORIZED and calls nothing', async () => {
      const fake = createFakeContext();

      await expect(
        createBusinessWithAI!(
          null as never,
          { input: CREATE_BUSINESS_WITH_AI_INPUT } as never,
          fake as unknown as GraphQLContext,
        INFO),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledTimes(0);
      expect(fake.clients.rwaClient.createBusinessWithAI.post).toHaveBeenCalledTimes(0);
    });

    test('checks ownership and forwards the AI prompt without fetching the business', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.createBusinessWithAI.post.mockImplementation(async () => edenOk(BUSINESS));

      const result = await createBusinessWithAI!(
        null as never,
        { input: CREATE_BUSINESS_WITH_AI_INPUT } as never,
        fake as unknown as GraphQLContext,
      INFO);

      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
        userId: fakeUser.id,
        ownerId: 'owner-1',
        ownerType: 'company',
        permission: 'content',
      });
      expect(fake.clients.rwaClient.getBusiness.post).toHaveBeenCalledTimes(0);
      expect(fake.clients.rwaClient.createBusinessWithAI.post).toHaveBeenCalledWith({
        description: 'Tokenized solar farm in Portugal',
        ownerId: 'owner-1',
        ownerType: 'company',
        chainId: '8453',
      });
      expect(result).toEqual(BUSINESS);
    });

    test('propagates an ownership rejection and never calls the client', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.services.ownership.checkOwnership.mockImplementation(async () => {
        throw new AppError({ message: 'User does not have permission', statusCode: 403, code: 'FORBIDDEN' });
      });

      await expect(
        createBusinessWithAI!(
          null as never,
          { input: CREATE_BUSINESS_WITH_AI_INPUT } as never,
          fake as unknown as GraphQLContext,
        INFO),
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

      expect(fake.clients.rwaClient.createBusinessWithAI.post).toHaveBeenCalledTimes(0);
    });

    test('maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.createBusinessWithAI.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(
        createBusinessWithAI!(
          null as never,
          { input: CREATE_BUSINESS_WITH_AI_INPUT } as never,
          fake as unknown as GraphQLContext,
        INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
    });
  });

  describe('Mutation.editBusiness', () => {
    test('rejects an anonymous caller with 401 UNAUTHORIZED and calls nothing', async () => {
      const fake = createFakeContext();

      await expect(
        editBusiness!(null as never, { input: EDIT_BUSINESS_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledTimes(0);
      expect(fake.clients.rwaClient.getBusiness.post).toHaveBeenCalledTimes(0);
      expect(fake.clients.rwaClient.editBusiness.post).toHaveBeenCalledTimes(0);
    });

    test('checks ownership on the fetched business and forwards the allow-listed update fields', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.getBusiness.post.mockImplementation(async () => edenOk(BUSINESS));
      const updatedBusiness = { ...BUSINESS, name: 'Solar Farm SPV II' };
      fake.clients.rwaClient.editBusiness.post.mockImplementation(async () => edenOk(updatedBusiness));

      const result = await editBusiness!(
        null as never,
        { input: EDIT_BUSINESS_INPUT } as never,
        fake as unknown as GraphQLContext,
      INFO);

      expect(fake.services.validation.validateCountry).toHaveBeenCalledWith('PT');
      expect(fake.services.validation.validateSocials).toHaveBeenCalledWith(SOCIALS);
      expect(fake.clients.rwaClient.getBusiness.post).toHaveBeenCalledWith({ id: 'business-1' });
      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
        userId: fakeUser.id,
        ownerId: 'owner-1',
        ownerType: 'company',
        permission: 'content',
      });
      expect(fake.clients.rwaClient.editBusiness.post).toHaveBeenCalledWith({
        id: 'business-1',
        updateData: {
          chainId: '8453',
          name: 'Solar Farm SPV II',
          description: 'Updated description',
          tags: ['renewable'],
          country: 'PT',
          businessType: 'startup',
          socials: SOCIALS,
        },
      });
      expect(result).toEqual(updatedBusiness);
    });

    test('drops update fields that are not allow-listed', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.getBusiness.post.mockImplementation(async () => edenOk(BUSINESS));
      fake.clients.rwaClient.editBusiness.post.mockImplementation(async () => edenOk(BUSINESS));
      const input = { id: 'business-1', updateData: { name: 'Renamed', ownerId: 'somebody-else' } };

      await editBusiness!(null as never, { input } as never, fake as unknown as GraphQLContext, INFO);

      const payload = fake.clients.rwaClient.editBusiness.post.mock.calls[0][0] as {
        updateData: Record<string, unknown>;
      };
      expect(Object.keys(payload.updateData).sort()).toEqual([
        'businessType',
        'chainId',
        'country',
        'description',
        'name',
        'socials',
        'tags',
      ]);
      expect(payload.updateData.ownerId).toBeUndefined();
    });

    test('maps a failed business fetch to 502 BAD_GATEWAY and never calls the edit', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.getBusiness.post.mockImplementation(async () =>
        edenError(404, 'NOT_FOUND', 'no business'),
      );

      await expect(
        editBusiness!(null as never, { input: EDIT_BUSINESS_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });

      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledTimes(0);
      expect(fake.clients.rwaClient.editBusiness.post).toHaveBeenCalledTimes(0);
    });

    test('maps a failed edit to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.getBusiness.post.mockImplementation(async () => edenOk(BUSINESS));
      fake.clients.rwaClient.editBusiness.post.mockImplementation(async () => edenError(500, 'INTERNAL_ERROR', 'boom'));

      await expect(
        editBusiness!(null as never, { input: EDIT_BUSINESS_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
    });
  });

  describe('Mutation.updateBusinessRiskScore', () => {
    test('rejects an anonymous caller with 401 UNAUTHORIZED and calls nothing', async () => {
      const fake = createFakeContext();

      await expect(
        updateBusinessRiskScore!(null as never, { id: 'business-1' } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

      expect(fake.clients.rwaClient.getBusiness.post).toHaveBeenCalledTimes(0);
      expect(fake.clients.rwaClient.requestBusinessEvaluation.post).toHaveBeenCalledTimes(0);
    });

    test('fetches the business, checks ownership and returns the refreshed evaluation', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.getBusiness.post.mockImplementation(async () => edenOk(BUSINESS));
      const evaluated = { ...BUSINESS, riskScore: 42 };
      fake.clients.rwaClient.requestBusinessEvaluation.post.mockImplementation(async () => edenOk(evaluated));

      const result = await updateBusinessRiskScore!(
        null as never,
        { id: 'business-1' } as never,
        fake as unknown as GraphQLContext,
      INFO);

      expect(fake.clients.rwaClient.getBusiness.post).toHaveBeenCalledWith({ id: 'business-1' });
      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
        userId: fakeUser.id,
        ownerId: 'owner-1',
        ownerType: 'company',
        permission: 'content',
      });
      expect(fake.clients.rwaClient.requestBusinessEvaluation.post).toHaveBeenCalledWith({ id: 'business-1' });
      expect(result).toEqual(evaluated);
    });

    test('maps a failed business fetch to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.getBusiness.post.mockImplementation(async () =>
        edenError(404, 'NOT_FOUND', 'no business'),
      );

      await expect(
        updateBusinessRiskScore!(null as never, { id: 'missing' } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });

      expect(fake.clients.rwaClient.requestBusinessEvaluation.post).toHaveBeenCalledTimes(0);
    });

    test('maps a failed evaluation request to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.getBusiness.post.mockImplementation(async () => edenOk(BUSINESS));
      fake.clients.rwaClient.requestBusinessEvaluation.post.mockImplementation(async () =>
        edenError(503, 'UNAVAILABLE', 'evaluator down'),
      );

      await expect(
        updateBusinessRiskScore!(null as never, { id: 'business-1' } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
    });
  });

  describe('Mutation.requestBusinessApprovalSignatures', () => {
    test('rejects an anonymous caller with 401 UNAUTHORIZED and calls nothing', async () => {
      const fake = createFakeContext();

      await expect(
        requestBusinessApprovalSignatures!(
          null as never,
          { input: REQUEST_BUSINESS_SIGNATURES_INPUT } as never,
          fake as unknown as GraphQLContext,
        INFO),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

      expect(fake.clients.rwaClient.getBusiness.post).toHaveBeenCalledTimes(0);
      expect(fake.clients.rwaClient.requestBusinessApprovalSignatures.post).toHaveBeenCalledTimes(0);
    });

    test('derives the wallets server-side and forwards the fee', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.getBusiness.post.mockImplementation(async () => edenOk(BUSINESS));
      fake.services.ownership.getOwnerWallet.mockImplementation(async () => '0xowner-wallet');
      const response = { taskId: 'task-1' };
      fake.clients.rwaClient.requestBusinessApprovalSignatures.post.mockImplementation(async () => edenOk(response));

      const result = await requestBusinessApprovalSignatures!(
        null as never,
        { input: REQUEST_BUSINESS_SIGNATURES_INPUT } as never,
        fake as unknown as GraphQLContext,
      INFO);

      expect(fake.clients.rwaClient.getBusiness.post).toHaveBeenCalledWith({ id: 'business-1' });
      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
        userId: fakeUser.id,
        ownerId: 'owner-1',
        ownerType: 'company',
        permission: 'deploy',
      });
      expect(fake.services.ownership.getOwnerWallet).toHaveBeenCalledWith({
        user: fakeUser,
        ownerId: 'owner-1',
        ownerType: 'company',
      });
      // The (deprecated) wallet inputs are ignored: ownerWallet comes from the ownership service,
      // deployerWallet from the authenticated user.
      expect(fake.clients.rwaClient.requestBusinessApprovalSignatures.post).toHaveBeenCalledWith({
        id: 'business-1',
        ownerWallet: '0xowner-wallet',
        deployerWallet: fakeUser.wallet,
        createRWAFee: '5',
      });
      expect(result).toEqual(response);
    });

    test('maps a failed business fetch to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.getBusiness.post.mockImplementation(async () =>
        edenError(404, 'NOT_FOUND', 'no business'),
      );

      await expect(
        requestBusinessApprovalSignatures!(
          null as never,
          { input: REQUEST_BUSINESS_SIGNATURES_INPUT } as never,
          fake as unknown as GraphQLContext,
        INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });

      expect(fake.clients.rwaClient.requestBusinessApprovalSignatures.post).toHaveBeenCalledTimes(0);
    });

    test('maps a failed signature request to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.getBusiness.post.mockImplementation(async () => edenOk(BUSINESS));
      fake.clients.rwaClient.requestBusinessApprovalSignatures.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'signers down'),
      );

      await expect(
        requestBusinessApprovalSignatures!(
          null as never,
          { input: REQUEST_BUSINESS_SIGNATURES_INPUT } as never,
          fake as unknown as GraphQLContext,
        INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
    });
  });

  describe('Mutation.rejectBusinessApprovalSignatures', () => {
    test('rejects an anonymous caller with 401 UNAUTHORIZED and calls nothing', async () => {
      const fake = createFakeContext();

      await expect(
        rejectBusinessApprovalSignatures!(
          null as never,
          { id: 'business-1' } as never,
          fake as unknown as GraphQLContext,
        INFO),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

      expect(fake.clients.rwaClient.getBusiness.post).toHaveBeenCalledTimes(0);
      expect(fake.clients.rwaClient.rejectBusinessApprovalSignatures.post).toHaveBeenCalledTimes(0);
    });

    test('returns true and discards the upstream payload', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.getBusiness.post.mockImplementation(async () => edenOk(BUSINESS));
      // The resolver returns a literal true (Boolean! in the schema) and never reads response.data.
      fake.clients.rwaClient.rejectBusinessApprovalSignatures.post.mockImplementation(async () =>
        edenOk({ rejected: false }),
      );

      const result = await rejectBusinessApprovalSignatures!(
        null as never,
        { id: 'business-1' } as never,
        fake as unknown as GraphQLContext,
      INFO);

      expect(fake.clients.rwaClient.getBusiness.post).toHaveBeenCalledWith({ id: 'business-1' });
      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
        userId: fakeUser.id,
        ownerId: 'owner-1',
        ownerType: 'company',
        permission: 'content',
      });
      expect(fake.clients.rwaClient.rejectBusinessApprovalSignatures.post).toHaveBeenCalledWith({ id: 'business-1' });
      expect(result).toBe(true);
    });

    test('maps a failed business fetch to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.getBusiness.post.mockImplementation(async () =>
        edenError(404, 'NOT_FOUND', 'no business'),
      );

      await expect(
        rejectBusinessApprovalSignatures!(null as never, { id: 'missing' } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });

      expect(fake.clients.rwaClient.rejectBusinessApprovalSignatures.post).toHaveBeenCalledTimes(0);
    });

    test('maps a failed reject request to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.getBusiness.post.mockImplementation(async () => edenOk(BUSINESS));
      fake.clients.rwaClient.rejectBusinessApprovalSignatures.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'signers down'),
      );

      await expect(
        rejectBusinessApprovalSignatures!(
          null as never,
          { id: 'business-1' } as never,
          fake as unknown as GraphQLContext,
        INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
    });
  });

  describe('Mutation.createPool', () => {
    test('rejects an anonymous caller with 401 UNAUTHORIZED and calls nothing', async () => {
      const fake = createFakeContext();

      await expect(
        createPool!(null as never, { input: CREATE_POOL_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

      expect(fake.clients.rwaClient.getBusiness.post).toHaveBeenCalledTimes(0);
      expect(fake.clients.rwaClient.createPool.post).toHaveBeenCalledTimes(0);
    });

    test('fetches the business, checks ownership and forwards the pool configuration', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.getBusiness.post.mockImplementation(async () => edenOk(BUSINESS));
      fake.clients.rwaClient.createPool.post.mockImplementation(async () => edenOk(POOL));

      const result = await createPool!(
        null as never,
        { input: CREATE_POOL_INPUT } as never,
        fake as unknown as GraphQLContext,
      INFO);

      expect(fake.clients.rwaClient.getBusiness.post).toHaveBeenCalledWith({ id: 'business-1' });
      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
        userId: fakeUser.id,
        ownerId: 'owner-1', // derived from the fetched business
        ownerType: 'company', // derived from the fetched business
        permission: 'content',
      });
      expect(fake.clients.rwaClient.createPool.post).toHaveBeenCalledWith({
        ...CREATE_POOL_INPUT,
        ownerId: 'owner-1',
        ownerType: 'company',
        chainId: '8453',
        rwaAddress: '0xrwa-token',
      });
      expect(result).toEqual(POOL);
    });

    test('derives owner fields and rwaAddress from the business, overriding conflicting input', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.getBusiness.post.mockImplementation(async () => edenOk(BUSINESS));
      fake.clients.rwaClient.createPool.post.mockImplementation(async () => edenOk(POOL));
      const input = {
        name: 'Conflicting pool',
        businessId: 'business-1',
        ownerId: 'attacker-owner',
        ownerType: 'attacker',
        chainId: '1',
        rwaAddress: '0xnot-the-token',
      };

      await createPool!(null as never, { input } as never, fake as unknown as GraphQLContext, INFO);

      expect(fake.clients.rwaClient.createPool.post).toHaveBeenCalledWith({
        name: 'Conflicting pool',
        businessId: 'business-1',
        ownerId: 'owner-1',
        ownerType: 'company',
        chainId: '8453',
        rwaAddress: '0xrwa-token',
      });
    });

    test('rejects a business without a deployed token with 409 CONFLICT', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.getBusiness.post.mockImplementation(async () =>
        edenOk({ ...BUSINESS, tokenAddress: null }),
      );

      await expect(
        createPool!(null as never, { input: CREATE_POOL_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });

      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledTimes(0);
      expect(fake.clients.rwaClient.createPool.post).toHaveBeenCalledTimes(0);
    });

    test('maps a failed business fetch to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.getBusiness.post.mockImplementation(async () =>
        edenError(404, 'NOT_FOUND', 'no business'),
      );

      await expect(
        createPool!(null as never, { input: CREATE_POOL_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });

      expect(fake.clients.rwaClient.createPool.post).toHaveBeenCalledTimes(0);
    });

    test('maps a failed pool creation to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.getBusiness.post.mockImplementation(async () => edenOk(BUSINESS));
      fake.clients.rwaClient.createPool.post.mockImplementation(async () => edenError(500, 'INTERNAL_ERROR', 'boom'));

      await expect(
        createPool!(null as never, { input: CREATE_POOL_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
    });
  });

  describe('Mutation.createPoolWithAI', () => {
    test('rejects an anonymous caller with 401 UNAUTHORIZED and calls nothing', async () => {
      const fake = createFakeContext();

      await expect(
        createPoolWithAI!(
          null as never,
          { input: CREATE_POOL_WITH_AI_INPUT } as never,
          fake as unknown as GraphQLContext,
        INFO),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

      expect(fake.clients.rwaClient.getBusiness.post).toHaveBeenCalledTimes(0);
      expect(fake.clients.rwaClient.createPoolWithAI.post).toHaveBeenCalledTimes(0);
    });

    test('fetches the business and forwards the AI prompt with the derived owner data', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.getBusiness.post.mockImplementation(async () => edenOk(BUSINESS));
      fake.clients.rwaClient.createPoolWithAI.post.mockImplementation(async () => edenOk(POOL));

      const result = await createPoolWithAI!(
        null as never,
        { input: CREATE_POOL_WITH_AI_INPUT } as never,
        fake as unknown as GraphQLContext,
      INFO);

      expect(fake.clients.rwaClient.getBusiness.post).toHaveBeenCalledWith({ id: 'business-1' });
      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
        userId: fakeUser.id,
        ownerId: 'owner-1',
        ownerType: 'company',
        permission: 'content',
      });
      expect(fake.clients.rwaClient.createPoolWithAI.post).toHaveBeenCalledWith({
        description: 'AI generated pool for the solar farm',
        ownerId: 'owner-1',
        ownerType: 'company',
        businessId: 'business-1',
        chainId: '8453',
        rwaAddress: '0xrwa-token',
      });
      expect(result).toEqual(POOL);
    });

    test('rejects a business without a deployed token with 409 CONFLICT', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.getBusiness.post.mockImplementation(async () =>
        edenOk({ ...BUSINESS, tokenAddress: null }),
      );

      await expect(
        createPoolWithAI!(
          null as never,
          { input: CREATE_POOL_WITH_AI_INPUT } as never,
          fake as unknown as GraphQLContext,
        INFO),
      ).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });

      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledTimes(0);
      expect(fake.clients.rwaClient.createPoolWithAI.post).toHaveBeenCalledTimes(0);
    });

    test('maps a failed business fetch to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.getBusiness.post.mockImplementation(async () =>
        edenError(404, 'NOT_FOUND', 'no business'),
      );

      await expect(
        createPoolWithAI!(
          null as never,
          { input: CREATE_POOL_WITH_AI_INPUT } as never,
          fake as unknown as GraphQLContext,
        INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });

      expect(fake.clients.rwaClient.createPoolWithAI.post).toHaveBeenCalledTimes(0);
    });

    test('maps a failed pool creation to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.getBusiness.post.mockImplementation(async () => edenOk(BUSINESS));
      fake.clients.rwaClient.createPoolWithAI.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(
        createPoolWithAI!(
          null as never,
          { input: CREATE_POOL_WITH_AI_INPUT } as never,
          fake as unknown as GraphQLContext,
        INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
    });
  });

  describe('Mutation.editPool', () => {
    test('rejects an anonymous caller with 401 UNAUTHORIZED and calls nothing', async () => {
      const fake = createFakeContext();

      await expect(
        editPool!(null as never, { input: EDIT_POOL_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

      expect(fake.clients.rwaClient.getPool.post).toHaveBeenCalledTimes(0);
      expect(fake.clients.rwaClient.editPool.post).toHaveBeenCalledTimes(0);
    });

    test('checks ownership on the fetched pool and forwards the update data untouched', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.getPool.post.mockImplementation(async () => edenOk(POOL));
      const updatedPool = { ...POOL, name: 'Senior tranche II' };
      fake.clients.rwaClient.editPool.post.mockImplementation(async () => edenOk(updatedPool));

      const result = await editPool!(
        null as never,
        { input: EDIT_POOL_INPUT } as never,
        fake as unknown as GraphQLContext,
      INFO);

      expect(fake.clients.rwaClient.getPool.post).toHaveBeenCalledWith({ id: 'pool-1' });
      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
        userId: fakeUser.id,
        ownerId: 'owner-1',
        ownerType: 'company',
        permission: 'content',
      });
      expect(fake.clients.rwaClient.editPool.post).toHaveBeenCalledWith({
        id: 'pool-1',
        updateData: EDIT_POOL_INPUT.updateData,
      });
      expect(result).toEqual(updatedPool);
    });

    test('maps a failed pool fetch to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.getPool.post.mockImplementation(async () => edenError(404, 'NOT_FOUND', 'no pool'));

      await expect(
        editPool!(null as never, { input: EDIT_POOL_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });

      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledTimes(0);
      expect(fake.clients.rwaClient.editPool.post).toHaveBeenCalledTimes(0);
    });

    test('maps a failed edit to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.getPool.post.mockImplementation(async () => edenOk(POOL));
      fake.clients.rwaClient.editPool.post.mockImplementation(async () => edenError(500, 'INTERNAL_ERROR', 'boom'));

      await expect(
        editPool!(null as never, { input: EDIT_POOL_INPUT } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
    });
  });

  describe('Mutation.updatePoolRiskScore', () => {
    test('rejects an anonymous caller with 401 UNAUTHORIZED and calls nothing', async () => {
      const fake = createFakeContext();

      await expect(
        updatePoolRiskScore!(null as never, { id: 'pool-1' } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

      expect(fake.clients.rwaClient.getPool.post).toHaveBeenCalledTimes(0);
      expect(fake.clients.rwaClient.requestPoolEvaluation.post).toHaveBeenCalledTimes(0);
    });

    test('fetches the pool, checks ownership and returns the refreshed evaluation', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.getPool.post.mockImplementation(async () => edenOk(POOL));
      const evaluated = { ...POOL, riskScore: 7 };
      fake.clients.rwaClient.requestPoolEvaluation.post.mockImplementation(async () => edenOk(evaluated));

      const result = await updatePoolRiskScore!(
        null as never,
        { id: 'pool-1' } as never,
        fake as unknown as GraphQLContext,
      INFO);

      expect(fake.clients.rwaClient.getPool.post).toHaveBeenCalledWith({ id: 'pool-1' });
      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
        userId: fakeUser.id,
        ownerId: 'owner-1',
        ownerType: 'company',
        permission: 'content',
      });
      expect(fake.clients.rwaClient.requestPoolEvaluation.post).toHaveBeenCalledWith({ id: 'pool-1' });
      expect(result).toEqual(evaluated);
    });

    test('maps a failed pool fetch to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.getPool.post.mockImplementation(async () => edenError(404, 'NOT_FOUND', 'no pool'));

      await expect(
        updatePoolRiskScore!(null as never, { id: 'missing' } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });

      expect(fake.clients.rwaClient.requestPoolEvaluation.post).toHaveBeenCalledTimes(0);
    });

    test('maps a failed evaluation request to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.getPool.post.mockImplementation(async () => edenOk(POOL));
      fake.clients.rwaClient.requestPoolEvaluation.post.mockImplementation(async () =>
        edenError(503, 'UNAVAILABLE', 'evaluator down'),
      );

      await expect(
        updatePoolRiskScore!(null as never, { id: 'pool-1' } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
    });
  });

  describe('Mutation.requestPoolApprovalSignatures', () => {
    test('rejects an anonymous caller with 401 UNAUTHORIZED and calls nothing', async () => {
      const fake = createFakeContext();

      await expect(
        requestPoolApprovalSignatures!(
          null as never,
          { input: REQUEST_POOL_SIGNATURES_INPUT } as never,
          fake as unknown as GraphQLContext,
        INFO),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

      expect(fake.clients.rwaClient.getPool.post).toHaveBeenCalledTimes(0);
      expect(fake.clients.rwaClient.requestPoolApprovalSignatures.post).toHaveBeenCalledTimes(0);
    });

    test('derives the wallets server-side and returns only the taskId', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.getPool.post.mockImplementation(async () => edenOk(POOL));
      fake.services.ownership.getOwnerWallet.mockImplementation(async () => '0xowner-wallet');
      fake.clients.rwaClient.requestPoolApprovalSignatures.post.mockImplementation(async () =>
        edenOk({ taskId: 'task-1', extra: 'ignored' }),
      );

      const result = await requestPoolApprovalSignatures!(
        null as never,
        { input: REQUEST_POOL_SIGNATURES_INPUT } as never,
        fake as unknown as GraphQLContext,
      INFO);

      expect(fake.clients.rwaClient.getPool.post).toHaveBeenCalledWith({ id: 'pool-1' });
      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
        userId: fakeUser.id,
        ownerId: 'owner-1',
        ownerType: 'company',
        permission: 'deploy',
      });
      expect(fake.services.ownership.getOwnerWallet).toHaveBeenCalledWith({
        user: fakeUser,
        ownerId: 'owner-1',
        ownerType: 'company',
      });
      // The (deprecated) wallet inputs are ignored: ownerWallet comes from the ownership service,
      // deployerWallet from the authenticated user.
      expect(fake.clients.rwaClient.requestPoolApprovalSignatures.post).toHaveBeenCalledWith({
        id: 'pool-1',
        ownerWallet: '0xowner-wallet',
        deployerWallet: fakeUser.wallet,
        createPoolFeeRatio: '0.3',
      });
      // Only taskId is exposed (ApprovalSignaturesResponse), the rest of the payload is dropped.
      expect(result).toEqual({ taskId: 'task-1' });
    });

    test('propagates an ownership rejection and never requests signatures', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.getPool.post.mockImplementation(async () => edenOk(POOL));
      fake.services.ownership.checkOwnership.mockImplementation(async () => {
        throw new AppError({ message: 'User does not have permission', statusCode: 403, code: 'FORBIDDEN' });
      });

      await expect(
        requestPoolApprovalSignatures!(
          null as never,
          { input: REQUEST_POOL_SIGNATURES_INPUT } as never,
          fake as unknown as GraphQLContext,
        INFO),
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

      expect(fake.services.ownership.getOwnerWallet).toHaveBeenCalledTimes(0);
      expect(fake.clients.rwaClient.requestPoolApprovalSignatures.post).toHaveBeenCalledTimes(0);
    });

    test('maps a failed pool fetch to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.getPool.post.mockImplementation(async () => edenError(404, 'NOT_FOUND', 'no pool'));

      await expect(
        requestPoolApprovalSignatures!(
          null as never,
          { input: REQUEST_POOL_SIGNATURES_INPUT } as never,
          fake as unknown as GraphQLContext,
        INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });

      expect(fake.clients.rwaClient.requestPoolApprovalSignatures.post).toHaveBeenCalledTimes(0);
    });

    test('maps a failed signature request to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.getPool.post.mockImplementation(async () => edenOk(POOL));
      fake.clients.rwaClient.requestPoolApprovalSignatures.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'signers down'),
      );

      await expect(
        requestPoolApprovalSignatures!(
          null as never,
          { input: REQUEST_POOL_SIGNATURES_INPUT } as never,
          fake as unknown as GraphQLContext,
        INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
    });
  });

  describe('Mutation.rejectPoolApprovalSignatures', () => {
    test('rejects an anonymous caller with 401 UNAUTHORIZED and calls nothing', async () => {
      const fake = createFakeContext();

      await expect(
        rejectPoolApprovalSignatures!(null as never, { id: 'pool-1' } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

      expect(fake.clients.rwaClient.getPool.post).toHaveBeenCalledTimes(0);
      expect(fake.clients.rwaClient.rejectPoolApprovalSignatures.post).toHaveBeenCalledTimes(0);
    });

    test('returns true and discards the upstream payload', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.getPool.post.mockImplementation(async () => edenOk(POOL));
      // The resolver returns a literal true (Boolean! in the schema) and never reads response.data.
      fake.clients.rwaClient.rejectPoolApprovalSignatures.post.mockImplementation(async () =>
        edenOk({ rejected: false }),
      );

      const result = await rejectPoolApprovalSignatures!(
        null as never,
        { id: 'pool-1' } as never,
        fake as unknown as GraphQLContext,
      INFO);

      expect(fake.clients.rwaClient.getPool.post).toHaveBeenCalledWith({ id: 'pool-1' });
      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
        userId: fakeUser.id,
        ownerId: 'owner-1',
        ownerType: 'company',
        permission: 'content',
      });
      expect(fake.clients.rwaClient.rejectPoolApprovalSignatures.post).toHaveBeenCalledWith({ id: 'pool-1' });
      expect(result).toBe(true);
    });

    test('maps a failed pool fetch to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.getPool.post.mockImplementation(async () => edenError(404, 'NOT_FOUND', 'no pool'));

      await expect(
        rejectPoolApprovalSignatures!(null as never, { id: 'missing' } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });

      expect(fake.clients.rwaClient.rejectPoolApprovalSignatures.post).toHaveBeenCalledTimes(0);
    });

    test('maps a failed reject request to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.rwaClient.getPool.post.mockImplementation(async () => edenOk(POOL));
      fake.clients.rwaClient.rejectPoolApprovalSignatures.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'signers down'),
      );

      await expect(
        rejectPoolApprovalSignatures!(null as never, { id: 'pool-1' } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
    });
  });

  describe('Subscription.poolDeployed', () => {
    // poolDeployed is exposed as `{ subscribe }` (no resolver function), so it is tested
    // by calling subscribe directly with a fake pubSub and consuming the returned iterable.
    const subscribe = (fake: ReturnType<typeof createFakeContext>) =>
      (
        poolDeployed as unknown as {
          subscribe: (parent: unknown, args: unknown, context: GraphQLContext) => AsyncIterable<unknown>;
        }
      ).subscribe(null, {}, fake as unknown as GraphQLContext);

    test('subscribes to the pool:deployed channel and maps the event payload', async () => {
      const fake = createFakeContext();
      const event = {
        type: 'pool:deployed',
        payload: { id: 'pool-1', poolAddress: '0xpool-address' },
        metadata: { timestamp: 1, service: 'rwa', version: '1' },
      };
      // createPubSub().subscribe is synchronous: return the async iterator directly.
      fake.pubSub.subscribe.mockImplementation(() =>
        (async function* () {
          yield event;
        })(),
      );

      const received: unknown[] = [];
      for await (const value of subscribe(fake)) {
        received.push(value);
      }

      expect(fake.pubSub.subscribe).toHaveBeenCalledWith('pool:deployed');
      expect(received).toEqual([{ poolDeployed: event.payload }]);
    });

    test('is exposed as a subscribe-only resolver object', () => {
      expect(typeof (poolDeployed as { subscribe?: unknown }).subscribe).toBe('function');
      expect((poolDeployed as { resolve?: unknown }).resolve).toBeUndefined();
    });
  });
});
