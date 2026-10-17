/**
 * Unit tests for PoolService.
 *
 * Scope: the service layer only. The repository and every injected client are
 * replaced with in-memory fakes (tests/fakes/*.fake.ts), so these tests need
 * no database, no broker and no network. Run with `bun test` from services/rwa.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { AppError } from '@shared/errors/app-errors';
import { PoolService } from '../src/services/pool.service';
import type { PoolRepository } from '../src/repositories/pool.repository';
import type { PoolEventsClient } from '../src/clients/poolEvents.client';
import type { SignersManagerClient } from '../src/clients/eden.clients';
import type { OpenRouterClient } from '@shared/openrouter/client';
import type { EvaluationRequestsClient } from '../src/clients/evaluationRequests.client';
import type { WebhookEventsPublisher } from '@shared/webhooks/src';
import { createFakePoolRepository, type CreatePoolInput, type FakePoolRepository } from './fakes/pool.repository.fake';
import { createFakeOpenRouterClient, type FakeOpenRouterClient } from './fakes/open-router.client.fake';
import {
  createFakeSignersManagerClient,
  DEFAULT_SIGNATURE_TASK_ID,
  type FakeSignersManagerClient,
} from './fakes/signers-manager.client.fake';
import { createFakePoolEventsClient, type FakePoolEventsClient } from './fakes/pool-events.client.fake';
import {
  createFakeEvaluationRequestsClient,
  type FakeEvaluationRequestsClient,
} from './fakes/evaluation-requests.client.fake';
import {
  createFakeWebhookEventsPublisher,
  type FakeWebhookEventsPublisher,
} from './fakes/webhook-events.publisher.fake';
import type { FakePoolService } from './fakes/pool.service.fake';

const OWNER_ID = 'owner-1';
const OWNER_TYPE = 'business';
const CHAIN_ID = '97';
const FACTORY_ADDRESS = '0xF46A71cac8B1A8F734559Cc4367CD1546A1A29bF';
const OWNER_WALLET = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8';
const DEPLOYER_WALLET = '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc';
const CREATE_POOL_FEE_RATIO = '1000000000000000';
const OPEN_ROUTER_MODEL = 'test/model';
const FILES_BASE_URL = 'https://files.test/files';
const SUPPORTED_NETWORKS = [{ chainId: CHAIN_ID, name: 'BSC Testnet', factoryAddress: FACTORY_ADDRESS }];

const BUSINESS_ID = 'business-1';
const POOL_ADDRESS = '0x00000000000000000000000000000000000000aa';
const RWA_ADDRESS = '0x00000000000000000000000000000000000000bb';

const POOL = {
  ownerId: OWNER_ID,
  ownerType: OWNER_TYPE,
  name: 'Alpha Pool',
  businessId: BUSINESS_ID,
  chainId: CHAIN_ID,
  rwaAddress: RWA_ADDRESS,
};

// A pool that satisfies every precondition of requestApprovalSignatures.
const SIGNATURE_POOL: CreatePoolInput = {
  ...POOL,
  entryFeePercent: '100',
  exitFeePercent: '100',
  expectedHoldAmount: '1000',
  expectedRwaAmount: '1000',
  rewardPercent: '500',
  priceImpactPercent: '100',
  entryPeriodStart: 1717171717,
  entryPeriodExpired: 1717571717,
  completionPeriodExpired: 1727171717,
};

const POOL_AI_FIELDS = {
  name: 'AI Pool',
  tags: ['ai', 'pool'],
  description: 'AI-generated pool description',
  entryFeePercent: '100',
  exitFeePercent: '100',
  expectedHoldAmount: '1000000',
  expectedRwaAmount: '1000000',
  rewardPercent: '500',
  priceImpactPercent: '100',
  entryPeriodStart: 1717171717,
  entryPeriodExpired: 1717571717,
  completionPeriodExpired: 1727171717,
  awaitCompletionExpired: true,
  floatingOutTranchesTimestamps: false,
  fixedSell: true,
  allowEntryBurn: false,
  outgoingTranches: [{ amount: '250000', timestamp: 1717671717 }],
  incomingTranches: [{ amount: '275000', expiredAt: 1720171717 }],
};
const POOL_AI_CONTENT = `Here is the pool config: ${JSON.stringify(POOL_AI_FIELDS)}`;

// The blockchain Pool_Deployed event payload used by syncPoolAfterDeployment.
const DEPLOYMENT_EVENT = {
  emittedFrom: POOL_ADDRESS,
  awaitCompletionExpired: true,
  floatingOutTranchesTimestamps: false,
  holdToken: '0x00000000000000000000000000000000000000cc',
  rwaToken: RWA_ADDRESS,
  tokenId: '1',
  entityId: '',
  entityOwnerId: OWNER_ID,
  entityOwnerType: OWNER_TYPE,
  owner: OWNER_WALLET,
  expectedHoldAmount: '1000',
  expectedRwaAmount: '2000',
  expectedBonusAmount: '100',
  rewardPercent: '500',
  fixedSell: true,
  allowEntryBurn: false,
  entryPeriodStart: '1717171717',
  entryPeriodExpired: '1717571717',
  completionPeriodExpired: '1727171717',
  k: '42',
  entryFeePercent: '100',
  exitFeePercent: '100',
  outgoingTranches: ['250', '250'],
  outgoingTranchTimestamps: [1717671717, 1718171717],
  incomingTranches: ['275', '275'],
  incomingTrancheExpired: [1720171717, 1721171717],
};

// Cases for requestApprovalSignatures precondition validation.
const SIGNATURE_VALIDATION_CASES: Array<{ name: string; poolData: CreatePoolInput; message: string }> = [
  {
    name: 'a zero expectedHoldAmount',
    poolData: { ...SIGNATURE_POOL, expectedHoldAmount: '0' },
    message: 'expectedHoldAmount must be greater than 0',
  },
  {
    name: 'a zero rewardPercent',
    poolData: { ...SIGNATURE_POOL, rewardPercent: '0' },
    message: 'rewardPercent must be greater than 0',
  },
  {
    name: 'an entryPeriodExpired not after entryPeriodStart',
    poolData: { ...SIGNATURE_POOL, entryPeriodExpired: SIGNATURE_POOL.entryPeriodStart },
    message: 'entryPeriodExpired must be greater than entryPeriodStart',
  },
  {
    name: 'a completionPeriodExpired not after entryPeriodExpired',
    poolData: { ...SIGNATURE_POOL, completionPeriodExpired: SIGNATURE_POOL.entryPeriodExpired },
    message: 'completionPeriodExpired must be greater than entryPeriodExpired',
  },
  {
    name: 'a missing entryFeePercent',
    poolData: { ...SIGNATURE_POOL, entryFeePercent: '' },
    message: 'entryFeePercent is required',
  },
];

// Cases for the thin sync* forwarders that patch a pool found by its address.
const UPDATE_BY_ADDRESS_CASES: Array<{
  method: keyof FakePoolService;
  event: Record<string, unknown>;
  expected: Record<string, unknown>;
}> = [
  {
    method: 'syncPoolAwaitingRwaAmount',
    event: { emittedFrom: POOL_ADDRESS, awaitingRwaAmount: '20' },
    expected: { awaitingRwaAmount: '20' },
  },
  {
    method: 'syncPoolFundsFullyReturned',
    event: { emittedFrom: POOL_ADDRESS, timestamp: '1717000000' },
    expected: { isFullyReturned: true, fullReturnTimestamp: 1717000000 },
  },
  {
    method: 'syncPoolBonusWithdrawn',
    event: { emittedFrom: POOL_ADDRESS, currentAwaitingBonusAmount: '0', currentRewardedRwaAmount: '30' },
    expected: { awaitingBonusAmount: '0', rewardedRwaAmount: '30' },
  },
  {
    method: 'syncPoolIncomingReturnSummary',
    event: {
      emittedFrom: POOL_ADDRESS,
      currentTotalReturnedAmount: '40',
      currentAwaitingBonusAmount: '5',
      currentLastCompletedIncomingTranche: 1,
    },
    expected: { totalReturnedAmount: '40', awaitingBonusAmount: '5', lastCompletedIncomingTranche: 1 },
  },
  {
    method: 'syncPoolOutgoingClaimSummary',
    event: { emittedFrom: POOL_ADDRESS, currentTotalClaimedAmount: '50', currentOutgoingTranchesBalance: '60' },
    expected: { totalClaimedAmount: '50', outgoingTranchesBalance: '60' },
  },
  {
    method: 'syncPoolPausedState',
    event: { emittedFrom: POOL_ADDRESS, isPaused: true },
    expected: { paused: true },
  },
  {
    method: 'syncPoolReserves',
    event: { emittedFrom: POOL_ADDRESS, realHoldReserve: '1', virtualHoldReserve: '2', virtualRwaReserve: '3' },
    expected: { realHoldReserve: '1', virtualHoldReserve: '2', virtualRwaReserve: '3' },
  },
  {
    method: 'syncPoolTargetReached',
    event: { emittedFrom: POOL_ADDRESS, outgoingTranchesBalance: '70', floatingTimestampOffset: 111 },
    expected: { isTargetReached: true, outgoingTranchesBalance: '70', floatingTimestampOffset: 111 },
  },
];

describe('PoolService (unit, fake repositories and clients)', () => {
  let pools: FakePoolRepository;
  let openRouter: FakeOpenRouterClient;
  let signersManager: FakeSignersManagerClient;
  let poolEvents: FakePoolEventsClient;
  let evaluationRequests: FakeEvaluationRequestsClient;
  let webhooks: FakeWebhookEventsPublisher;
  let service: PoolService;

  beforeEach(() => {
    pools = createFakePoolRepository();
    openRouter = createFakeOpenRouterClient(POOL_AI_CONTENT);
    signersManager = createFakeSignersManagerClient();
    poolEvents = createFakePoolEventsClient();
    evaluationRequests = createFakeEvaluationRequestsClient();
    webhooks = createFakeWebhookEventsPublisher();
    service = new PoolService(
      pools as unknown as PoolRepository,
      openRouter as unknown as OpenRouterClient,
      signersManager as unknown as SignersManagerClient,
      poolEvents as unknown as PoolEventsClient,
      evaluationRequests as unknown as EvaluationRequestsClient,
      webhooks as unknown as WebhookEventsPublisher,
      SUPPORTED_NETWORKS,
      OPEN_ROUTER_MODEL,
      FILES_BASE_URL,
    );
  });

  test('createPool: forwards the payload and returns a mapped pool (creation emits no webhook)', async () => {
    const pool = await service.createPool(POOL);

    expect(pools.createPool).toHaveBeenCalledTimes(1);
    expect(pools.createPool).toHaveBeenCalledWith(POOL);
    expect(pool).toMatchObject(POOL);
    expect(typeof pool.id).toBe('string');
    expect(pool.id).toHaveLength(24); // Mongo ObjectId hex
    expect(typeof pool.createdAt).toBe('number');
    expect(pool).not.toHaveProperty('_id');
    expect(pool.isTargetReached).toBe(false);
    expect(pool.isFullyReturned).toBe(false);
    expect(pool.paused).toBe(false);
    expect(pool.outgoingTranches).toEqual([]);
    expect(pool.incomingTranches).toEqual([]);
    expect(pool.riskScoreEvaluationProcess).toBe(false);

    expect(webhooks.publish).toHaveBeenCalledTimes(0); // only the deployment is a webhook event
  });

  test('createPool: the DTO is plain JSON - string id, no raw _id leak', async () => {
    const pool = await service.createPool(POOL);
    const serialized = JSON.stringify(pool);

    expect(serialized).not.toContain('_id');
    expect(serialized).not.toContain('ObjectId');
    expect(JSON.parse(serialized).id).toBe(pool.id);
    expect(pool.id).toBe(pools.store.get(pool.id)!._id.toString());
  });

  test('createPool: rejects a chain id missing from supportedNetworks with 403 NOT_ALLOWED', async () => {
    await expect(service.createPool({ ...POOL, chainId: '1' })).rejects.toMatchObject({
      statusCode: 403,
      code: 'NOT_ALLOWED',
      message: 'Chain ID 1 is not supported',
    });

    expect(pools.createPool).toHaveBeenCalledTimes(0);
    expect(webhooks.publish).toHaveBeenCalledTimes(0);
  });

  test('createPoolWithAI: forwards every generated field into createPool', async () => {
    const pool = await service.createPoolWithAI({
      description: 'A real estate development fund',
      ownerId: OWNER_ID,
      ownerType: OWNER_TYPE,
      businessId: BUSINESS_ID,
      chainId: CHAIN_ID,
      rwaAddress: RWA_ADDRESS,
    });

    expect(openRouter.chatCompletion).toHaveBeenCalledTimes(1);
    const request = openRouter.chatCompletion.mock.calls[0][0];
    expect(request.model).toBe(OPEN_ROUTER_MODEL);
    expect(request.messages[0].content).toContain('A real estate development fund');

    expect(pools.createPool).toHaveBeenCalledWith({
      name: POOL_AI_FIELDS.name,
      ownerId: OWNER_ID,
      ownerType: OWNER_TYPE,
      businessId: BUSINESS_ID,
      chainId: CHAIN_ID,
      rwaAddress: RWA_ADDRESS,
      description: POOL_AI_FIELDS.description,
      tags: POOL_AI_FIELDS.tags,
      entryFeePercent: POOL_AI_FIELDS.entryFeePercent,
      exitFeePercent: POOL_AI_FIELDS.exitFeePercent,
      expectedHoldAmount: POOL_AI_FIELDS.expectedHoldAmount,
      expectedRwaAmount: POOL_AI_FIELDS.expectedRwaAmount,
      rewardPercent: POOL_AI_FIELDS.rewardPercent,
      priceImpactPercent: POOL_AI_FIELDS.priceImpactPercent,
      entryPeriodStart: POOL_AI_FIELDS.entryPeriodStart,
      entryPeriodExpired: POOL_AI_FIELDS.entryPeriodExpired,
      completionPeriodExpired: POOL_AI_FIELDS.completionPeriodExpired,
      awaitCompletionExpired: POOL_AI_FIELDS.awaitCompletionExpired,
      floatingOutTranchesTimestamps: POOL_AI_FIELDS.floatingOutTranchesTimestamps,
      fixedSell: POOL_AI_FIELDS.fixedSell,
      allowEntryBurn: POOL_AI_FIELDS.allowEntryBurn,
      outgoingTranches: POOL_AI_FIELDS.outgoingTranches,
      incomingTranches: POOL_AI_FIELDS.incomingTranches,
    });
    expect(pool.name).toBe(POOL_AI_FIELDS.name);
    expect(pool.expectedHoldAmount).toBe(POOL_AI_FIELDS.expectedHoldAmount);
  });

  test('createPoolWithAI: an AI response without a JSON object maps to 502 AI_ERROR', async () => {
    openRouter.setChatCompletionContent('No configuration available.');

    await expect(
      service.createPoolWithAI({
        description: 'A real estate development fund',
        ownerId: OWNER_ID,
        ownerType: OWNER_TYPE,
        businessId: BUSINESS_ID,
        chainId: CHAIN_ID,
        rwaAddress: RWA_ADDRESS,
      }),
    ).rejects.toMatchObject({
      statusCode: 502,
      code: 'AI_ERROR',
    });

    // Current behaviour: the inner "No valid JSON object found in AI response"
    // AppError is thrown inside the try block and re-wrapped by the catch as
    // "Failed to parse AI response as JSON", so the inner message never surfaces.
    expect(pools.createPool).toHaveBeenCalledTimes(0);
  });

  test('createPoolWithAI: an AI response without content maps to 502 AI_ERROR', async () => {
    openRouter.setChatCompletionContent(null);

    await expect(
      service.createPoolWithAI({
        description: 'A real estate development fund',
        ownerId: OWNER_ID,
        ownerType: OWNER_TYPE,
        businessId: BUSINESS_ID,
        chainId: CHAIN_ID,
        rwaAddress: RWA_ADDRESS,
      }),
    ).rejects.toMatchObject({
      statusCode: 502,
      code: 'AI_ERROR',
      message: 'Failed to get AI response for pool field generation',
    });
  });

  test('createPoolWithAI: rejects a chain id missing from supportedNetworks with 403 NOT_ALLOWED', async () => {
    await expect(
      service.createPoolWithAI({
        description: 'A real estate development fund',
        ownerId: OWNER_ID,
        ownerType: OWNER_TYPE,
        businessId: BUSINESS_ID,
        chainId: '1',
        rwaAddress: RWA_ADDRESS,
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'NOT_ALLOWED' });

    expect(openRouter.chatCompletion).toHaveBeenCalledTimes(0);
  });

  test('updatePoolImage: forwards image and fileId and computes imageUrl', async () => {
    const created = await service.createPool(POOL);

    const updated = await service.updatePoolImage({
      id: created.id,
      image: '2025/06/27/15/uuid.png',
      fileId: 'file-1',
    });

    expect(pools.updatePool).toHaveBeenCalledWith(created.id, {
      image: '2025/06/27/15/uuid.png',
      fileId: 'file-1',
    });
    expect(updated.imageUrl).toBe(`${FILES_BASE_URL}/2025/06/27/15/uuid.png`);
    expect(updated.fileId).toBe('file-1');
  });

  test('editPool: applies a partial update and returns the mapped pool', async () => {
    const created = await service.createPool(POOL);

    const updated = await service.editPool({ id: created.id, updateData: { name: 'Renamed Pool' } });

    expect(pools.updatePool).toHaveBeenCalledWith(created.id, { name: 'Renamed Pool' });
    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe('Renamed Pool');
  });

  test('editPool: blocks every immutable field while an approval signatures task is pending', async () => {
    const created = await service.createPool(POOL);
    await pools.updatePool(created.id, { approvalSignaturesTaskId: 'task-1' });

    const immutableEdits: Array<Record<string, unknown>> = [
      { chainId: '56' },
      { expectedHoldAmount: '1' },
      { expectedRwaAmount: '1' },
      { entryFeePercent: '10' },
      { exitFeePercent: '10' },
      { rewardPercent: '10' },
      { entryPeriodStart: 1 },
      { entryPeriodExpired: 2 },
      { completionPeriodExpired: 3 },
      { awaitCompletionExpired: true },
      { floatingOutTranchesTimestamps: true },
      { fixedSell: false },
      { allowEntryBurn: true },
      { priceImpactPercent: '10' },
      { outgoingTranches: [] },
      { incomingTranches: [] },
    ];

    for (const updateData of immutableEdits) {
      const field = Object.keys(updateData)[0];
      await expect(service.editPool({ id: created.id, updateData })).rejects.toMatchObject({
        statusCode: 403,
        code: 'NOT_ALLOWED',
        message: `Cannot edit ${field} while approval signatures task is pending`,
      });
    }

    expect(pools.updatePool).toHaveBeenCalledTimes(1); // only the seeding call
  });

  test('editPool: keeps descriptive fields editable while an approval signatures task is pending', async () => {
    const created = await service.createPool(POOL);
    await pools.updatePool(created.id, { approvalSignaturesTaskId: 'task-1' });

    const updated = await service.editPool({
      id: created.id,
      updateData: { name: 'Still editable', description: 'New description', tags: ['tag'] },
    });

    expect(updated.name).toBe('Still editable');
    expect(updated.description).toBe('New description');
  });

  test('editPool: propagates NOT_FOUND for an unknown id', async () => {
    await expect(service.editPool({ id: 'unknown-id', updateData: { name: 'x' } })).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  test('requestEvaluation: flags the pool and publishes an evaluatePool request', async () => {
    const created = await service.createPool(POOL);

    const result = await service.requestEvaluation({ id: created.id });

    expect(pools.updatePool).toHaveBeenCalledWith(created.id, {
      riskScoreEvaluationProcess: true,
      riskScoreEvaluationStartedAt: expect.any(Number),
    });
    expect(evaluationRequests.publishEvaluationRequest).toHaveBeenCalledWith('evaluatePool', {
      poolId: created.id,
      ownerId: OWNER_ID,
      ownerType: OWNER_TYPE,
    });
    expect(result.riskScoreEvaluationProcess).toBe(true);
  });

  test('requestEvaluation: rejects a fresh in-progress evaluation with 403 NOT_ALLOWED', async () => {
    const created = await service.createPool(POOL);
    await pools.updatePool(created.id, {
      riskScoreEvaluationProcess: true,
      riskScoreEvaluationStartedAt: Math.floor(Date.now() / 1000),
    });

    await expect(service.requestEvaluation({ id: created.id })).rejects.toMatchObject({
      statusCode: 403,
      code: 'NOT_ALLOWED',
      message: 'Evaluation already in progress',
    });

    expect(evaluationRequests.publishEvaluationRequest).toHaveBeenCalledTimes(0);
  });

  test('requestEvaluation: allows a new request once the in-progress flag is stale', async () => {
    const created = await service.createPool(POOL);
    await pools.updatePool(created.id, {
      riskScoreEvaluationProcess: true,
      // Beyond the 1 hour stale window the service applies.
      riskScoreEvaluationStartedAt: Math.floor(Date.now() / 1000) - 2 * 60 * 60,
    });

    const result = await service.requestEvaluation({ id: created.id });

    expect(evaluationRequests.publishEvaluationRequest).toHaveBeenCalledTimes(1);
    expect(result.riskScoreEvaluationProcess).toBe(true);
  });

  test('requestEvaluation: clears the flags and rethrows when the request publish fails', async () => {
    const created = await service.createPool(POOL);
    const brokerError = new AppError({
      message: 'RabbitMQ channel not initialized',
      statusCode: 503,
      code: 'SERVICE_UNAVAILABLE',
    });
    evaluationRequests.publishEvaluationRequest.mockImplementationOnce(async () => {
      throw brokerError;
    });

    await expect(service.requestEvaluation({ id: created.id })).rejects.toBe(brokerError);

    expect(pools.updatePool).toHaveBeenLastCalledWith(created.id, {
      riskScoreEvaluationProcess: false,
      riskScoreEvaluationStartedAt: 0,
    });
    const stored = pools.store.get(created.id)!;
    expect(stored.riskScoreEvaluationProcess).toBe(false);
    expect(stored.riskScoreEvaluationStartedAt).toBe(0);
  });

  test('setRiskScore: accepts the 1..100 boundaries and clears the evaluation flags', async () => {
    const created = await service.createPool(POOL);
    await pools.updatePool(created.id, { riskScoreEvaluationProcess: true, riskScoreEvaluationStartedAt: 123 });

    for (const riskScore of [1, 100]) {
      const result = await service.setRiskScore({ id: created.id, riskScore });

      expect(result.riskScore).toBe(riskScore);
      expect(pools.updatePool).toHaveBeenLastCalledWith(created.id, {
        riskScore,
        riskScoreEvaluationProcess: false,
        riskScoreEvaluationStartedAt: 0,
      });
    }
  });

  test('setRiskScore: rejects scores outside 1..100 with 400 VALIDATION_ERROR', async () => {
    const created = await service.createPool(POOL);

    for (const riskScore of [0, -1, 101]) {
      await expect(service.setRiskScore({ id: created.id, riskScore })).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'riskScore must be between 1 and 100',
      });
    }

    expect(pools.updatePool).toHaveBeenCalledTimes(0);
  });

  test('resetEvaluation: clears the evaluation flags', async () => {
    const created = await service.createPool(POOL);
    await pools.updatePool(created.id, { riskScoreEvaluationProcess: true, riskScoreEvaluationStartedAt: 42 });

    const result = await service.resetEvaluation({ id: created.id });

    expect(pools.updatePool).toHaveBeenLastCalledWith(created.id, {
      riskScoreEvaluationProcess: false,
      riskScoreEvaluationStartedAt: 0,
    });
    expect(result.riskScoreEvaluationProcess).toBe(false);
  });

  test('requestApprovalSignatures: creates a signers-manager task and stores it on the pool', async () => {
    const pool = await pools.createPool(SIGNATURE_POOL);

    const before = Math.floor(Date.now() / 1000);
    const result = await service.requestApprovalSignatures({
      id: pool._id.toString(),
      ownerWallet: OWNER_WALLET,
      deployerWallet: DEPLOYER_WALLET,
      createPoolFeeRatio: CREATE_POOL_FEE_RATIO,
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

    const stored = pools.store.get(pool._id.toString())!;
    expect(stored.approvalSignaturesTaskId).toBe(DEFAULT_SIGNATURE_TASK_ID);
    expect(stored.approvalSignaturesTaskExpired).toBe(body.expired);
  });

  test('requestApprovalSignatures: the message hash depends on the pool configuration', async () => {
    const first = await pools.createPool(SIGNATURE_POOL);
    const second = await pools.createPool({ ...SIGNATURE_POOL, expectedHoldAmount: '2000' });

    await service.requestApprovalSignatures({
      id: first._id.toString(),
      ownerWallet: OWNER_WALLET,
      deployerWallet: DEPLOYER_WALLET,
      createPoolFeeRatio: CREATE_POOL_FEE_RATIO,
    });
    await service.requestApprovalSignatures({
      id: second._id.toString(),
      ownerWallet: OWNER_WALLET,
      deployerWallet: DEPLOYER_WALLET,
      createPoolFeeRatio: CREATE_POOL_FEE_RATIO,
    });

    const firstHash = signersManager.createSignatureTask.post.mock.calls[0][0].hash;
    const secondHash = signersManager.createSignatureTask.post.mock.calls[1][0].hash;
    expect(firstHash).not.toBe(secondHash);
  });

  test('requestApprovalSignatures: rejects a pool that already has an active task', async () => {
    const pool = await pools.createPool(SIGNATURE_POOL);
    await pools.updatePool(pool._id.toString(), { approvalSignaturesTaskId: 'task-existing' });

    await expect(
      service.requestApprovalSignatures({
        id: pool._id.toString(),
        ownerWallet: OWNER_WALLET,
        deployerWallet: DEPLOYER_WALLET,
        createPoolFeeRatio: CREATE_POOL_FEE_RATIO,
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'NOT_ALLOWED',
      message: 'Pool already has an active approval signatures task',
    });

    expect(signersManager.createSignatureTask.post).toHaveBeenCalledTimes(0);
  });

  for (const { name, poolData, message } of SIGNATURE_VALIDATION_CASES) {
    test(`requestApprovalSignatures: rejects ${name} with 400 VALIDATION_ERROR`, async () => {
      const pool = await pools.createPool(poolData);

      await expect(
        service.requestApprovalSignatures({
          id: pool._id.toString(),
          ownerWallet: OWNER_WALLET,
          deployerWallet: DEPLOYER_WALLET,
          createPoolFeeRatio: CREATE_POOL_FEE_RATIO,
        }),
      ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR', message });

      expect(signersManager.createSignatureTask.post).toHaveBeenCalledTimes(0);
    });
  }

  test('requestApprovalSignatures: rejects with 404 NOT_FOUND when the chain has no network config', async () => {
    // The fake repository does not validate chain ids, so an unsupported chain
    // can be seeded directly to reach the network lookup.
    const pool = await pools.createPool({ ...SIGNATURE_POOL, chainId: '1' });

    await expect(
      service.requestApprovalSignatures({
        id: pool._id.toString(),
        ownerWallet: OWNER_WALLET,
        deployerWallet: DEPLOYER_WALLET,
        createPoolFeeRatio: CREATE_POOL_FEE_RATIO,
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Network configuration not found for chain ID 1',
    });

    expect(signersManager.createSignatureTask.post).toHaveBeenCalledTimes(0);
  });

  test('requestApprovalSignatures: propagates a signers-manager error without storing a task', async () => {
    const pool = await pools.createPool(SIGNATURE_POOL);
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
        id: pool._id.toString(),
        ownerWallet: OWNER_WALLET,
        deployerWallet: DEPLOYER_WALLET,
        createPoolFeeRatio: CREATE_POOL_FEE_RATIO,
      }),
    ).rejects.toBe(taskError);

    expect(pools.store.get(pool._id.toString())!.approvalSignaturesTaskId).toBeUndefined();
  });

  test('rejectApprovalSignatures: rejects a deployed pool with 403 NOT_ALLOWED', async () => {
    const created = await service.createPool(POOL);
    await pools.updatePool(created.id, { poolAddress: POOL_ADDRESS });

    await expect(service.rejectApprovalSignatures(created.id)).rejects.toMatchObject({
      statusCode: 403,
      code: 'NOT_ALLOWED',
      message: 'Pool deployed!',
    });
  });

  test('rejectApprovalSignatures: rejects when there is no active approval signatures task', async () => {
    const created = await service.createPool(POOL);

    await expect(service.rejectApprovalSignatures(created.id)).rejects.toMatchObject({
      statusCode: 403,
      code: 'NOT_ALLOWED',
      message: 'Pool has no active approval signatures task',
    });
  });

  test('rejectApprovalSignatures: rejects before the task expires', async () => {
    const created = await service.createPool(POOL);
    await pools.updatePool(created.id, {
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
    const created = await service.createPool(POOL);
    await pools.updatePool(created.id, {
      approvalSignaturesTaskId: 'task-1',
      approvalSignaturesTaskExpired: Math.floor(Date.now() / 1000) - 3600,
    });

    await expect(service.rejectApprovalSignatures(created.id)).resolves.toBeUndefined();

    // Note: the pool flow passes `null` explicitly (the business flow passes
    // `undefined` instead) - mirroring the current implementation.
    expect(pools.updatePool).toHaveBeenLastCalledWith(created.id, {
      approvalSignaturesTaskId: null,
      approvalSignaturesTaskExpired: null,
    });
  });

  test('syncPoolAfterDeployment: maps the deployment event, publishes redis and webhook events', async () => {
    const pool = await pools.createPool(POOL);
    const event = { ...DEPLOYMENT_EVENT, entityId: pool._id.toString() };
    const sourceId = '97:0xdeadbeef:3';

    const result = await service.syncPoolAfterDeployment(event, { sourceId });

    expect(pools.updatePool).toHaveBeenCalledTimes(1);
    const [updatedId, updateData] = pools.updatePool.mock.calls[0];
    expect(updatedId).toBe(pool._id.toString());
    expect(updateData).toMatchObject({
      poolAddress: event.emittedFrom,
      holdToken: event.holdToken,
      rwaAddress: event.rwaToken,
      tokenId: event.tokenId,
      ownerWallet: event.owner,
      floatingOutTranchesTimestamps: event.floatingOutTranchesTimestamps,
      awaitCompletionExpired: event.awaitCompletionExpired,
      expectedHoldAmount: event.expectedHoldAmount,
      expectedRwaAmount: event.expectedRwaAmount,
      expectedBonusAmount: event.expectedBonusAmount,
      rewardPercent: event.rewardPercent,
      fixedSell: event.fixedSell,
      allowEntryBurn: event.allowEntryBurn,
      entryPeriodStart: event.entryPeriodStart,
      entryPeriodExpired: event.entryPeriodExpired,
      completionPeriodExpired: event.completionPeriodExpired,
      k: event.k,
      entryFeePercent: event.entryFeePercent,
      exitFeePercent: event.exitFeePercent,
    });
    // Tranches are zipped with their timestamps and reset to zero executions.
    expect(updateData.outgoingTranches).toEqual([
      { amount: '250', timestamp: 1717671717, executedAmount: '0' },
      { amount: '250', timestamp: 1718171717, executedAmount: '0' },
    ]);
    expect(updateData.incomingTranches).toEqual([
      { amount: '275', expiredAt: 1720171717, returnedAmount: '0' },
      { amount: '275', expiredAt: 1721171717, returnedAmount: '0' },
    ]);

    expect(result.poolAddress).toBe(event.emittedFrom);
    expect(result.holdToken).toBe(event.holdToken);
    expect(result.tokenId).toBe(event.tokenId);

    expect(poolEvents.publishPoolDeployed).toHaveBeenCalledTimes(1);
    expect(poolEvents.publishPoolDeployed).toHaveBeenCalledWith(expect.objectContaining({ id: pool._id.toString(), poolAddress: POOL_ADDRESS }));
    // The fake pool-events client delegates to redis like the real one.
    expect(poolEvents.redisClient.publish).toHaveBeenCalledWith('pool:deployed', 'POOL_DEPLOYED', expect.any(Object));

    expect(webhooks.publish).toHaveBeenCalledTimes(1);
    expect(webhooks.publish).toHaveBeenCalledWith(
      'pool.deployed',
      {
        poolId: pool._id.toString(),
        poolAddress: POOL_ADDRESS,
        ownerId: OWNER_ID,
        ownerWallet: event.owner,
        holdToken: event.holdToken,
        rwaAddress: event.rwaToken,
        tokenId: event.tokenId,
        expectedHoldAmount: event.expectedHoldAmount,
        expectedRwaAmount: event.expectedRwaAmount,
      },
      sourceId,
    );
  });

  test('syncPoolAfterDeployment: rejects with NOT_FOUND for an unknown pool', async () => {
    // The repository already throws for a missing id, so the service-level
    // `if (!pool)` guard is unreachable - the 404 comes from the repository.
    await expect(service.syncPoolAfterDeployment({ ...DEPLOYMENT_EVENT, entityId: 'unknown-pool' })).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Pool unknown-pool not found',
    });

    expect(poolEvents.publishPoolDeployed).toHaveBeenCalledTimes(0);
    expect(webhooks.publish).toHaveBeenCalledTimes(0);
  });

  for (const { method, event, expected } of UPDATE_BY_ADDRESS_CASES) {
    test(`${method}: forwards the mapped fields to updatePoolByAddress`, async () => {
      const pool = await pools.createPool({ ...POOL, poolAddress: POOL_ADDRESS });

      const handler = (service as unknown as Record<string, (event: Record<string, unknown>) => Promise<{ id: string }>>)[
        method
      ];
      const result = await handler.call(service, event);

      expect(pools.updatePoolByAddress).toHaveBeenCalledWith(POOL_ADDRESS, expected);
      expect(result.id).toBe(pool._id.toString());
    });
  }

  test('syncPoolIncomingTrancheUpdate: sets returnedAmount on the requested tranche', async () => {
    const pool = await pools.createPool({
      ...POOL,
      poolAddress: POOL_ADDRESS,
      incomingTranches: [
        { amount: '100', expiredAt: 1717171717, returnedAmount: '0' },
        { amount: '200', expiredAt: 1718171717, returnedAmount: '0' },
      ],
    });

    const result = await service.syncPoolIncomingTrancheUpdate({
      emittedFrom: POOL_ADDRESS,
      trancheIndex: 1,
      amountAppliedToTranche: '150',
      isNowComplete: true,
      wasOnTime: true,
    });

    expect(pools.updatePoolByAddress).toHaveBeenCalledWith(POOL_ADDRESS, {
      incomingTranches: [
        { amount: '100', expiredAt: 1717171717, returnedAmount: '0' },
        { amount: '200', expiredAt: 1718171717, returnedAmount: '150' },
      ],
    });
    expect(result.incomingTranches?.[1]?.returnedAmount).toBe('150');
    expect(result.id).toBe(pool._id.toString());
  });
  
  test('syncPoolIncomingTrancheUpdate: accumulates partial returns for the same tranche', async () => {
    const pool = await pools.createPool({
      ...POOL,
      poolAddress: POOL_ADDRESS,
      incomingTranches: [
        { amount: '200', expiredAt: 1717171717, returnedAmount: '50' },
      ],
    });

    const result = await service.syncPoolIncomingTrancheUpdate({
      emittedFrom: POOL_ADDRESS,
      trancheIndex: 0,
      amountAppliedToTranche: '150',
      isNowComplete: true,
      wasOnTime: true,
    });

    expect(pools.updatePoolByAddress).toHaveBeenCalledWith(POOL_ADDRESS, {
      incomingTranches: [
        { amount: '200', expiredAt: 1717171717, returnedAmount: '200' },
      ],
    });
    expect(result.incomingTranches?.[0]?.returnedAmount).toBe('200');
    expect(result.id).toBe(pool._id.toString());
  });

  test('syncPoolIncomingTrancheUpdate: rejects an out-of-range tranche index with 400 VALIDATION_ERROR', async () => {
    await pools.createPool({
      ...POOL,
      poolAddress: POOL_ADDRESS,
      incomingTranches: [{ amount: '100', expiredAt: 1717171717, returnedAmount: '0' }],
    });

    await expect(
      service.syncPoolIncomingTrancheUpdate({
        emittedFrom: POOL_ADDRESS,
        trancheIndex: 5,
        amountAppliedToTranche: '150',
        isNowComplete: false,
        wasOnTime: false,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid tranche index 5',
    });

    expect(pools.updatePoolByAddress).toHaveBeenCalledTimes(0);
  });

  test('syncPoolIncomingTrancheUpdate: rejects an unknown pool address with 404 NOT_FOUND', async () => {
    await expect(
      service.syncPoolIncomingTrancheUpdate({
        emittedFrom: '0xunknown',
        trancheIndex: 0,
        amountAppliedToTranche: '150',
        isNowComplete: false,
        wasOnTime: false,
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Pool with address 0xunknown not found',
    });
  });

  test('syncPoolOutgoingTrancheClaimed: sets executedAmount on the requested tranche', async () => {
    const pool = await pools.createPool({
      ...POOL,
      poolAddress: POOL_ADDRESS,
      outgoingTranches: [
        { amount: '100', timestamp: 1717171717, executedAmount: '0' },
        { amount: '200', timestamp: 1718171717, executedAmount: '0' },
      ],
    });

    const result = await service.syncPoolOutgoingTrancheClaimed({
      emittedFrom: POOL_ADDRESS,
      trancheIndex: 0,
      amountClaimed: '90',
    });

    expect(pools.updatePoolByAddress).toHaveBeenCalledWith(POOL_ADDRESS, {
      outgoingTranches: [
        { amount: '100', timestamp: 1717171717, executedAmount: '90' },
        { amount: '200', timestamp: 1718171717, executedAmount: '0' },
      ],
    });
    expect(result.outgoingTranches?.[0]?.executedAmount).toBe('90');
    expect(result.id).toBe(pool._id.toString());
  });

  test('syncPoolOutgoingTrancheClaimed: rejects an out-of-range tranche index with 400 VALIDATION_ERROR', async () => {
    await pools.createPool({
      ...POOL,
      poolAddress: POOL_ADDRESS,
      outgoingTranches: [{ amount: '100', timestamp: 1717171717, executedAmount: '0' }],
    });

    await expect(
      service.syncPoolOutgoingTrancheClaimed({
        emittedFrom: POOL_ADDRESS,
        trancheIndex: 3,
        amountClaimed: '90',
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid tranche index 3',
    });
  });

  test('getPool: returns the mapped pool with defaults', async () => {
    const created = await service.createPool(POOL);

    const pool = await service.getPool(created.id);

    expect(pool.id).toBe(created.id);
    expect(pool.name).toBe(POOL.name);
    expect(pool).not.toHaveProperty('_id');
    expect(pool.awaitCompletionExpired).toBe(true); // entity default
    expect(pool.realHoldReserve).toBe('0'); // mapper default
    expect(pool.totalClaimedAmount).toBe('0');
    expect(pool.lastCompletedIncomingTranche).toBe(0);
  });

  test('getPool: propagates NOT_FOUND for an unknown id', async () => {
    await expect(service.getPool('unknown-id')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  test('getPools: passes filter/pagination through and maps every result', async () => {
    await service.createPool(POOL);
    await service.createPool({ ...POOL, name: 'Second', businessId: 'business-2' });
    await service.createPool({ ...POOL, name: 'Third', businessId: 'business-2' });

    const result = await service.getPools({ filter: { businessId: 'business-2' }, limit: 10, offset: 0 });

    expect(pools.findAll).toHaveBeenCalledWith({ businessId: 'business-2' }, undefined, 10, 0);
    expect(result).toHaveLength(2);
    expect(result.map((pool) => pool.name)).toEqual(['Second', 'Third']); // insertion order is stable in the fake
    for (const pool of result) expect(pool).not.toHaveProperty('_id');
  });

  test('getPools: returns an empty array when nothing matches', async () => {
    await service.createPool(POOL);

    const result = await service.getPools({ filter: { businessId: 'nobody' } });

    expect(result).toEqual([]);
  });
});
