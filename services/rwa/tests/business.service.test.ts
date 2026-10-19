/**
 * Unit tests for BusinessService.
 *
 * Scope: the service layer only. The repository and every injected client are
 * replaced with in-memory fakes (tests/fakes/*.fake.ts), so these tests need
 * no database, no broker and no network. Run with `bun test` from services/rwa.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { ethers } from 'ethers';
import { AppError } from '@shared/errors/app-errors';
import { BusinessService } from '../src/services/business.service';
import type { BusinessRepository } from '../src/repositories/business.repository';
import type { SignersManagerClient } from '../src/clients/eden.clients';
import type { OpenRouterClient } from '@shared/openrouter/client';
import type { OutboxPublisherService } from '@shared/outbox-publisher';
import { createFakeBusinessRepository, type FakeBusinessRepository } from './fakes/business.repository.fake';
import { createFakeOpenRouterClient, type FakeOpenRouterClient } from './fakes/open-router.client.fake';
import {
  createFakeSignersManagerClient,
  DEFAULT_SIGNATURE_TASK_ID,
  type FakeSignersManagerClient,
} from './fakes/signers-manager.client.fake';
import { createFakeOutboxPublisher, type FakeOutboxPublisher } from './fakes/outbox-publisher.fake';

const OWNER_ID = 'owner-1';
const OWNER_TYPE = 'business';
const CHAIN_ID = '97';
const FACTORY_ADDRESS = '0xF46A71cac8B1A8F734559Cc4367CD1546A1A29bF';
const OWNER_WALLET = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8';
const DEPLOYER_WALLET = '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc';
const CREATE_RWA_FEE = '1000000000000000';
const OPEN_ROUTER_MODEL = 'test/model';
const FILES_BASE_URL = 'https://files.test/files';
const SUPPORTED_NETWORKS = [{ chainId: CHAIN_ID, name: 'BSC Testnet', factoryAddress: FACTORY_ADDRESS }];

const BUSINESS = {
  name: 'Alpha Ventures',
  ownerId: OWNER_ID,
  ownerType: OWNER_TYPE,
  chainId: CHAIN_ID,
};

const BUSINESS_AI_FIELDS = {
  name: 'AI Ventures',
  tags: ['ai', 'fintech'],
  description: 'AI-generated description',
};
const BUSINESS_AI_CONTENT = `Here is the result: ${JSON.stringify(BUSINESS_AI_FIELDS)}`;

/** Wraps contract-event data into the envelope the broker delivers. */
function eventOf<TData extends Record<string, any>>(data: TData) {
  return {
    chainId: CHAIN_ID,
    name: 'Unknown',
    blockNumber: 1,
    transactionHash: '0xtestevent',
    address: '0x0000000000000000000000000000000000000000',
    logIndex: 0,
    timestamp: 1_700_000_000,
    data,
  };
}

describe('BusinessService (unit, fake repositories and clients)', () => {
  let businesses: FakeBusinessRepository;
  let openRouter: FakeOpenRouterClient;
  let signersManager: FakeSignersManagerClient;
  let outbox: FakeOutboxPublisher;
  let service: BusinessService;

  beforeEach(() => {
    businesses = createFakeBusinessRepository();
    openRouter = createFakeOpenRouterClient(BUSINESS_AI_CONTENT);
    signersManager = createFakeSignersManagerClient();
    outbox = createFakeOutboxPublisher();
    service = new BusinessService(
      businesses as unknown as BusinessRepository,
      openRouter as unknown as OpenRouterClient,
      signersManager as unknown as SignersManagerClient,
      outbox as unknown as OutboxPublisherService,
      'evaluation',
      SUPPORTED_NETWORKS,
      OPEN_ROUTER_MODEL,
      FILES_BASE_URL,
    );
  });

  test('createBusiness: forwards the payload and returns a mapped business', async () => {
    const business = await service.createBusiness(BUSINESS);

    expect(businesses.createBusiness).toHaveBeenCalledTimes(1);
    expect(businesses.createBusiness).toHaveBeenCalledWith(BUSINESS);
    expect(business).toMatchObject(BUSINESS);
    expect(typeof business.id).toBe('string');
    expect(business.id).toHaveLength(24); // Mongo ObjectId hex
    expect(typeof business.createdAt).toBe('number');
    expect(business).not.toHaveProperty('_id');
    expect(business.riskScoreEvaluationProcess).toBe(false);
    expect(business.socials).toEqual([]);
    expect(business.imageUrl).toBeUndefined();
  });

  test('createBusiness: the DTO is plain JSON - string id, no raw _id leak', async () => {
    const business = await service.createBusiness(BUSINESS);
    const serialized = JSON.stringify(business);

    expect(serialized).not.toContain('_id');
    expect(serialized).not.toContain('ObjectId');
    expect(JSON.parse(serialized).id).toBe(business.id);
    expect(business.id).toBe(businesses.store.get(business.id)!._id.toString());
  });

  test('createBusiness: rejects a chain id missing from supportedNetworks with 403 NOT_ALLOWED', async () => {
    await expect(service.createBusiness({ ...BUSINESS, chainId: '1' })).rejects.toMatchObject({
      statusCode: 403,
      code: 'NOT_ALLOWED',
      message: 'Chain ID 1 is not supported',
    });

    expect(businesses.createBusiness).toHaveBeenCalledTimes(0);
  });

  test('createBusinessWithAI: generates fields via OpenRouter and creates the business', async () => {
    const business = await service.createBusinessWithAI({
      description: 'A fintech startup for small businesses',
      ownerId: OWNER_ID,
      ownerType: OWNER_TYPE,
      chainId: CHAIN_ID,
    });

    expect(openRouter.chatCompletion).toHaveBeenCalledTimes(1);
    const request = openRouter.chatCompletion.mock.calls[0][0];
    expect(request.model).toBe(OPEN_ROUTER_MODEL);
    expect(request.messages[0].content).toContain('A fintech startup for small businesses');

    expect(businesses.createBusiness).toHaveBeenCalledWith({
      name: BUSINESS_AI_FIELDS.name,
      ownerId: OWNER_ID,
      ownerType: OWNER_TYPE,
      chainId: CHAIN_ID,
      description: BUSINESS_AI_FIELDS.description,
      tags: BUSINESS_AI_FIELDS.tags,
    });
    expect(business.name).toBe(BUSINESS_AI_FIELDS.name);
    expect(business.tags).toEqual(BUSINESS_AI_FIELDS.tags);
  });

  test('createBusinessWithAI: an AI response without a JSON object maps to 502 AI_ERROR', async () => {
    openRouter.setChatCompletionContent('Sorry, I cannot generate that.');

    await expect(
      service.createBusinessWithAI({
        description: 'A fintech startup',
        ownerId: OWNER_ID,
        ownerType: OWNER_TYPE,
        chainId: CHAIN_ID,
      }),
    ).rejects.toMatchObject({
      statusCode: 502,
      code: 'AI_ERROR',
    });

    // Current behaviour: the inner "No valid JSON object found in AI response"
    // AppError is thrown inside the try block and re-wrapped by the catch as
    // "Failed to parse AI response as JSON", so the inner message never surfaces.
    expect(businesses.createBusiness).toHaveBeenCalledTimes(0);
  });

  test('createBusinessWithAI: an AI response without content maps to 502 AI_ERROR', async () => {
    openRouter.setChatCompletionContent(null);

    await expect(
      service.createBusinessWithAI({
        description: 'A fintech startup',
        ownerId: OWNER_ID,
        ownerType: OWNER_TYPE,
        chainId: CHAIN_ID,
      }),
    ).rejects.toMatchObject({
      statusCode: 502,
      code: 'AI_ERROR',
      message: 'Failed to get AI response for business field generation',
    });
  });

  test('createBusinessWithAI: rejects a chain id missing from supportedNetworks with 403 NOT_ALLOWED', async () => {
    await expect(
      service.createBusinessWithAI({
        description: 'A fintech startup',
        ownerId: OWNER_ID,
        ownerType: OWNER_TYPE,
        chainId: '1',
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'NOT_ALLOWED' });

    expect(openRouter.chatCompletion).toHaveBeenCalledTimes(0);
  });

  test('updateBusinessImage: forwards image and fileId and computes imageUrl', async () => {
    const created = await service.createBusiness(BUSINESS);

    const updated = await service.updateBusinessImage({
      id: created.id,
      image: '2025/06/27/15/uuid.png',
      fileId: 'file-1',
    });

    expect(businesses.updateBusiness).toHaveBeenCalledWith(created.id, {
      image: '2025/06/27/15/uuid.png',
      fileId: 'file-1',
    });
    expect(updated.image).toBe('2025/06/27/15/uuid.png');
    expect(updated.imageUrl).toBe(`${FILES_BASE_URL}/2025/06/27/15/uuid.png`);
    expect(updated.fileId).toBe('file-1');
  });

  test('editBusiness: applies a partial update and returns the mapped business', async () => {
    const created = await service.createBusiness(BUSINESS);

    const updated = await service.editBusiness({
      id: created.id,
      updateData: { name: 'Renamed', tags: ['renamed'] },
    });

    expect(businesses.updateBusiness).toHaveBeenCalledWith(created.id, { name: 'Renamed', tags: ['renamed'] });
    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe('Renamed');
    expect(updated.tags).toEqual(['renamed']);
  });

  test('editBusiness: blocks chainId edits while an approval signatures task is pending', async () => {
    const created = await service.createBusiness(BUSINESS);
    await businesses.updateBusiness(created.id, { approvalSignaturesTaskId: 'task-1' });

    await expect(service.editBusiness({ id: created.id, updateData: { chainId: '56' } })).rejects.toMatchObject({
      statusCode: 403,
      code: 'NOT_ALLOWED',
      message: 'Cannot edit chainId while approval signatures task is pending',
    });

    expect(businesses.updateBusiness).toHaveBeenCalledTimes(1); // only the seeding call
  });

  test('editBusiness: keeps non-immutable fields editable while an approval signatures task is pending', async () => {
    const created = await service.createBusiness(BUSINESS);
    await businesses.updateBusiness(created.id, { approvalSignaturesTaskId: 'task-1' });

    const updated = await service.editBusiness({ id: created.id, updateData: { name: 'Still editable' } });

    expect(updated.name).toBe('Still editable');
  });

  test('editBusiness: propagates NOT_FOUND for an unknown id', async () => {
    await expect(service.editBusiness({ id: 'unknown-id', updateData: { name: 'x' } })).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  test('requestEvaluation: flags the business and publishes an evaluateBusiness request', async () => {
    const created = await service.createBusiness(BUSINESS);

    const result = await service.requestEvaluation({ id: created.id });

    expect(businesses.updateBusiness).toHaveBeenCalledWith(created.id, {
      riskScoreEvaluationProcess: true,
      riskScoreEvaluationStartedAt: expect.any(Number),
    });
    expect(outbox.publish).toHaveBeenCalledWith(
      'evaluation',
      'evaluateBusiness',
      { businessId: created.id, ownerId: OWNER_ID, ownerType: OWNER_TYPE },
      expect.stringMatching(/^business:/),
    );
    expect(result.riskScoreEvaluationProcess).toBe(true);
  });

  test('requestEvaluation: rejects a fresh in-progress evaluation with 403 NOT_ALLOWED', async () => {
    const created = await service.createBusiness(BUSINESS);
    await businesses.updateBusiness(created.id, {
      riskScoreEvaluationProcess: true,
      riskScoreEvaluationStartedAt: Math.floor(Date.now() / 1000),
    });

    await expect(service.requestEvaluation({ id: created.id })).rejects.toMatchObject({
      statusCode: 403,
      code: 'NOT_ALLOWED',
      message: 'Evaluation already in progress',
    });

    expect(outbox.publish).toHaveBeenCalledTimes(0);
  });

  test('requestEvaluation: allows a new request once the in-progress flag is stale', async () => {
    const created = await service.createBusiness(BUSINESS);
    await businesses.updateBusiness(created.id, {
      riskScoreEvaluationProcess: true,
      // Beyond the 1 hour stale window the service applies.
      riskScoreEvaluationStartedAt: Math.floor(Date.now() / 1000) - 2 * 60 * 60,
    });

    const result = await service.requestEvaluation({ id: created.id });

    expect(outbox.publish).toHaveBeenCalledTimes(1);
    expect(result.riskScoreEvaluationProcess).toBe(true);
  });

  test('requestEvaluation: clears the flags and rethrows when the request publish fails', async () => {
    const created = await service.createBusiness(BUSINESS);
    const brokerError = new AppError({
      message: 'RabbitMQ channel not initialized',
      statusCode: 503,
      code: 'SERVICE_UNAVAILABLE',
    });
    outbox.publish.mockImplementationOnce(async () => {
      throw brokerError;
    });

    await expect(service.requestEvaluation({ id: created.id })).rejects.toBe(brokerError);

    expect(businesses.updateBusiness).toHaveBeenLastCalledWith(created.id, {
      riskScoreEvaluationProcess: false,
      riskScoreEvaluationStartedAt: 0,
    });
    const stored = businesses.store.get(created.id)!;
    expect(stored.riskScoreEvaluationProcess).toBe(false);
    expect(stored.riskScoreEvaluationStartedAt).toBe(0);
  });

  test('setRiskScore: accepts the 1..100 boundaries and clears the evaluation flags', async () => {
    const created = await service.createBusiness(BUSINESS);
    await businesses.updateBusiness(created.id, {
      riskScoreEvaluationProcess: true,
      riskScoreEvaluationStartedAt: 123,
    });

    for (const riskScore of [1, 100]) {
      const result = await service.setRiskScore({ id: created.id, riskScore });

      expect(result.riskScore).toBe(riskScore);
      expect(businesses.updateBusiness).toHaveBeenLastCalledWith(created.id, {
        riskScore,
        riskScoreEvaluationProcess: false,
        riskScoreEvaluationStartedAt: 0,
      });
    }
  });

  test('setRiskScore: rejects scores outside 1..100 with 400 VALIDATION_ERROR', async () => {
    const created = await service.createBusiness(BUSINESS);

    for (const riskScore of [0, -1, 101]) {
      await expect(service.setRiskScore({ id: created.id, riskScore })).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'riskScore must be between 1 and 100',
      });
    }

    expect(businesses.updateBusiness).toHaveBeenCalledTimes(0);
  });

  test('resetEvaluation: clears the evaluation flags', async () => {
    const created = await service.createBusiness(BUSINESS);
    await businesses.updateBusiness(created.id, {
      riskScoreEvaluationProcess: true,
      riskScoreEvaluationStartedAt: 42,
    });

    const result = await service.resetEvaluation({ id: created.id });

    expect(businesses.updateBusiness).toHaveBeenLastCalledWith(created.id, {
      riskScoreEvaluationProcess: false,
      riskScoreEvaluationStartedAt: 0,
    });
    expect(result.riskScoreEvaluationProcess).toBe(false);
  });

  test('applyEvaluationResult: a completed result writes the risk score and clears the flags', async () => {
    const created = await service.createBusiness(BUSINESS);
    await businesses.updateBusiness(created.id, { riskScoreEvaluationProcess: true, riskScoreEvaluationStartedAt: 42 });

    const result = await service.applyEvaluationResult({
      evaluationId: 'eval-1',
      entityType: 'business',
      entityId: created.id,
      status: 'completed',
      riskScore: 77,
    });

    expect(businesses.updateBusiness).toHaveBeenLastCalledWith(created.id, {
      riskScore: 77,
      riskScoreEvaluationProcess: false,
      riskScoreEvaluationStartedAt: 0,
    });
    expect(result.riskScore).toBe(77);
  });

  test('applyEvaluationResult: a failed result only clears the flags', async () => {
    const created = await service.createBusiness(BUSINESS);
    await businesses.updateBusiness(created.id, { riskScoreEvaluationProcess: true, riskScoreEvaluationStartedAt: 42 });

    await service.applyEvaluationResult({
      evaluationId: 'eval-1',
      entityType: 'business',
      entityId: created.id,
      status: 'failed',
    });

    expect(businesses.updateBusiness).toHaveBeenLastCalledWith(created.id, {
      riskScoreEvaluationProcess: false,
      riskScoreEvaluationStartedAt: 0,
    });
  });

  test('applyEvaluationResult: a result for another entity type is rejected', async () => {
    const created = await service.createBusiness(BUSINESS);

    await expect(
      service.applyEvaluationResult({
        evaluationId: 'eval-1',
        entityType: 'pool' as 'business',
        entityId: created.id,
        status: 'completed',
        riskScore: 77,
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });

    expect(businesses.updateBusiness).toHaveBeenCalledTimes(0);
  });

  test('applyEvaluationResult: a completed result without a riskScore is rejected', async () => {
    const created = await service.createBusiness(BUSINESS);

    await expect(
      service.applyEvaluationResult({
        evaluationId: 'eval-1',
        entityType: 'business',
        entityId: created.id,
        status: 'completed',
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
  });

  test('applyEvaluationResult: an incomplete result is rejected', async () => {
    await expect(
      service.applyEvaluationResult({ entityType: 'business' } as never),
    ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
  });

  test('requestApprovalSignatures: creates a signers-manager task and stores it on the business', async () => {
    const created = await service.createBusiness(BUSINESS);

    const before = Math.floor(Date.now() / 1000);
    const result = await service.requestApprovalSignatures({
      id: created.id,
      ownerWallet: OWNER_WALLET,
      deployerWallet: DEPLOYER_WALLET,
      createRWAFee: CREATE_RWA_FEE,
    });
    const after = Math.floor(Date.now() / 1000);

    expect(result).toEqual({ taskId: DEFAULT_SIGNATURE_TASK_ID });
    expect(signersManager.createSignatureTask.post).toHaveBeenCalledTimes(1);

    const body = signersManager.createSignatureTask.post.mock.calls[0][0];
    expect(body.ownerId).toBe(OWNER_ID);
    expect(body.ownerType).toBe(OWNER_TYPE);
    expect(body.requiredSignatures).toBe(3);
    expect(body.hash).toMatch(/^0x[0-9a-f]{64}$/);
    // The task expires 24 hours from now.
    expect(body.expired).toBeGreaterThanOrEqual(before + 86400);
    expect(body.expired).toBeLessThanOrEqual(after + 86400);

    // The hash must encode exactly the deployRWA parameters. This mirrors
    // BusinessService.generateMessageHash.
    const expectedHash = ethers.solidityPackedKeccak256(
      ['uint256', 'address', 'address', 'string', 'uint256', 'string', 'string', 'string', 'address'],
      [
        BigInt(CHAIN_ID),
        ethers.getAddress(FACTORY_ADDRESS),
        ethers.getAddress(DEPLOYER_WALLET),
        'deployRWA',
        BigInt(CREATE_RWA_FEE),
        created.id,
        OWNER_ID,
        OWNER_TYPE,
        ethers.getAddress(OWNER_WALLET),
      ],
    );
    expect(body.hash).toBe(expectedHash);

    const stored = businesses.store.get(created.id)!;
    expect(stored.approvalSignaturesTaskId).toBe(DEFAULT_SIGNATURE_TASK_ID);
    expect(stored.approvalSignaturesTaskExpired).toBe(body.expired);
  });

  test('requestApprovalSignatures: the message hash is bound to the entity id', async () => {
    const first = await service.createBusiness({ ...BUSINESS, name: 'First' });
    const second = await service.createBusiness({ ...BUSINESS, name: 'Second' });

    await service.requestApprovalSignatures({
      id: first.id,
      ownerWallet: OWNER_WALLET,
      deployerWallet: DEPLOYER_WALLET,
      createRWAFee: CREATE_RWA_FEE,
    });
    await service.requestApprovalSignatures({
      id: second.id,
      ownerWallet: OWNER_WALLET,
      deployerWallet: DEPLOYER_WALLET,
      createRWAFee: CREATE_RWA_FEE,
    });

    const firstHash = signersManager.createSignatureTask.post.mock.calls[0][0].hash;
    const secondHash = signersManager.createSignatureTask.post.mock.calls[1][0].hash;
    expect(firstHash).not.toBe(secondHash);
  });

  test('requestApprovalSignatures: rejects a business that already has an active task', async () => {
    const created = await service.createBusiness(BUSINESS);
    await businesses.updateBusiness(created.id, { approvalSignaturesTaskId: 'task-existing' });

    await expect(
      service.requestApprovalSignatures({
        id: created.id,
        ownerWallet: OWNER_WALLET,
        deployerWallet: DEPLOYER_WALLET,
        createRWAFee: CREATE_RWA_FEE,
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'NOT_ALLOWED',
      message: 'Business already has an active approval signatures task',
    });

    expect(signersManager.createSignatureTask.post).toHaveBeenCalledTimes(0);
  });

  test('requestApprovalSignatures: rejects with 404 NOT_FOUND when the chain has no network config', async () => {
    const created = await service.createBusiness(BUSINESS);
    // Seed a chain id that is missing from supportedNetworks directly in the fake store.
    businesses.store.get(created.id)!.chainId = '1';

    await expect(
      service.requestApprovalSignatures({
        id: created.id,
        ownerWallet: OWNER_WALLET,
        deployerWallet: DEPLOYER_WALLET,
        createRWAFee: CREATE_RWA_FEE,
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Network configuration not found for chain ID 1',
    });

    expect(signersManager.createSignatureTask.post).toHaveBeenCalledTimes(0);
  });

  test('requestApprovalSignatures: propagates a signers-manager error without storing a task', async () => {
    const created = await service.createBusiness(BUSINESS);
    const taskError = new AppError({
      message: 'Signers manager unavailable',
      statusCode: 502,
      code: 'UPSTREAM_ERROR',
    });
    signersManager.createSignatureTask.post.mockImplementationOnce(async () => ({
      data: null,
      error: taskError,
      status: 502,
    }));

    await expect(
      service.requestApprovalSignatures({
        id: created.id,
        ownerWallet: OWNER_WALLET,
        deployerWallet: DEPLOYER_WALLET,
        createRWAFee: CREATE_RWA_FEE,
      }),
    ).rejects.toBe(taskError);

    expect(businesses.store.get(created.id)!.approvalSignaturesTaskId).toBeUndefined();
  });

  test('rejectApprovalSignatures: rejects an already deployed business with 403 NOT_ALLOWED', async () => {
    const created = await service.createBusiness(BUSINESS);
    await businesses.updateBusiness(created.id, { tokenAddress: '0x00000000000000000000000000000000000000aa' });

    await expect(service.rejectApprovalSignatures(created.id)).rejects.toMatchObject({
      statusCode: 403,
      code: 'NOT_ALLOWED',
      message: 'Business already deployed!',
    });
  });

  test('rejectApprovalSignatures: rejects when there is no active approval signatures task', async () => {
    const created = await service.createBusiness(BUSINESS);

    await expect(service.rejectApprovalSignatures(created.id)).rejects.toMatchObject({
      statusCode: 403,
      code: 'NOT_ALLOWED',
      message: 'Business has no active approval signatures task',
    });
  });

  test('rejectApprovalSignatures: rejects before the task expires', async () => {
    const created = await service.createBusiness(BUSINESS);
    await businesses.updateBusiness(created.id, {
      approvalSignaturesTaskId: 'task-1',
      approvalSignaturesTaskExpired: Math.floor(Date.now() / 1000) + 3600,
    });

    await expect(service.rejectApprovalSignatures(created.id)).rejects.toMatchObject({
      statusCode: 403,
      code: 'NOT_ALLOWED',
      message: 'Cannot reject approval signatures before expiration',
    });
  });

  test('rejectApprovalSignatures: clears the task once it has expired', async () => {
    const created = await service.createBusiness(BUSINESS);
    await businesses.updateBusiness(created.id, {
      approvalSignaturesTaskId: 'task-1',
      approvalSignaturesTaskExpired: Math.floor(Date.now() / 1000) - 3600,
    });

    await expect(service.rejectApprovalSignatures(created.id)).resolves.toBeUndefined();

    // Note: the business flow passes an explicit `undefined` here while the pool
    // flow passes `null`; mongoose may ignore undefined update keys, so this may
    // not actually clear the field. The test mirrors the current call as-is.
    expect(businesses.updateBusiness).toHaveBeenLastCalledWith(created.id, { approvalSignaturesTaskId: undefined });
  });

  test('syncAfterDeployment: stores the deployment data', async () => {
    const created = await service.createBusiness(BUSINESS);
    const tokenAddress = '0x00000000000000000000000000000000000000aa';

    const result = await service.syncAfterDeployment(
      eventOf({
        entityId: created.id,
        emittedFrom: tokenAddress,
        owner: OWNER_WALLET,
      }),
    );

    expect(businesses.updateBusiness).toHaveBeenLastCalledWith(created.id, {
      tokenAddress,
      ownerWallet: OWNER_WALLET,
    });
    expect(result.tokenAddress).toBe(tokenAddress);
    expect(result.ownerWallet).toBe(OWNER_WALLET);

  });

  test('syncPausedState: flips the pause flag on the business found by token address', async () => {
    const created = await service.createBusiness(BUSINESS);
    const tokenAddress = '0x00000000000000000000000000000000000000aa';
    await service.syncAfterDeployment(eventOf({ entityId: created.id, emittedFrom: tokenAddress, owner: OWNER_WALLET }));

    const result = await service.syncPausedState(eventOf({ emittedFrom: tokenAddress, isPaused: true }));

    expect(businesses.updateBusinessByTokenAddress).toHaveBeenLastCalledWith(tokenAddress, { paused: true });
    expect(result.paused).toBe(true);
  });

  test('syncPausedState: propagates NOT_FOUND for an unknown token address', async () => {
    await expect(service.syncPausedState(eventOf({ emittedFrom: '0xunknown', isPaused: true }))).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  test('getBusiness: returns the mapped business', async () => {
    const created = await service.createBusiness(BUSINESS);

    const business = await service.getBusiness(created.id);

    expect(business.id).toBe(created.id);
    expect(business.name).toBe(BUSINESS.name);
    expect(business).not.toHaveProperty('_id');
  });

  test('getBusiness: propagates NOT_FOUND for an unknown id', async () => {
    await expect(service.getBusiness('unknown-id')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  test('getBusinesses: passes filter/pagination through and maps every result', async () => {
    await service.createBusiness(BUSINESS);
    await service.createBusiness({ ...BUSINESS, name: 'Second', ownerId: 'owner-2' });
    await service.createBusiness({ ...BUSINESS, name: 'Third', ownerId: 'owner-2' });

    const result = await service.getBusinesses({ filter: { ownerId: 'owner-2' }, limit: 10, offset: 0 });

    expect(businesses.findAll).toHaveBeenCalledWith({ ownerId: 'owner-2' }, undefined, 10, 0);
    expect(result).toHaveLength(2);
    expect(result.map((business) => business.name)).toEqual(['Second', 'Third']); // insertion order is stable in the fake
    for (const business of result) expect(business).not.toHaveProperty('_id');
  });

  test('getBusinesses: returns an empty array when nothing matches', async () => {
    await service.createBusiness(BUSINESS);

    const result = await service.getBusinesses({ filter: { ownerId: 'nobody' } });

    expect(result).toEqual([]);
  });
});
