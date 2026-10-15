import { AppError } from '@shared/errors/app-errors';
import { PoolRepository } from '../repositories/pool.repository';
import { OpenRouterClient } from '@shared/openrouter/client';
import type { SignersManagerClient } from '../clients/eden.clients';
import { ethers } from 'ethers';
import type { SortOrder } from 'mongoose';
import { PoolEventsClient } from '../clients/poolEvents.client';
import type { EvaluationRequestsClient } from '../clients/evaluationRequests.client';
import type { WebhookEventsPublisher } from '@shared/webhooks/src';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import { MetricsDecorator } from '@shared/monitoring/src/metricsDecorator';
import { LogDecorator } from '@shared/monitoring/src/logDecorator';
import { setSpanAttributes } from '@shared/monitoring/src/tracing';
import { buildFileUrl } from '@shared/files/src/index';

// An evaluation stuck "in progress" longer than this (seconds) is considered
// stale - its request or result was lost on the way - and may be requested again.
const EVALUATION_STALE_AFTER_SECONDS = 60 * 60;

export class PoolService {
  constructor(
    private readonly poolRepository: PoolRepository,
    private readonly openRouterClient: OpenRouterClient,
    private readonly signersManagerClient: SignersManagerClient,
    private readonly poolEventsClient: PoolEventsClient,
    private readonly evaluationRequestsClient: EvaluationRequestsClient,
    private readonly webhookEventsPublisher: WebhookEventsPublisher,
    private readonly supportedNetworks: {
      chainId: string;
      name: string;
      factoryAddress: string;
    }[],
    private readonly openRouterModel: string,
    private readonly filesBaseUrl: string,
  ) {}

  private async generatePoolFields(description: string) {
    const systemMessage = `You are a DeFi pool configuration expert. Analyze the following pool description and generate optimal pool parameters.

Key concepts:
1. The pool collects HOLD tokens during entry period and mints RWA tokens
2. After reaching target, HOLD tokens are released to owner through outgoing tranches
3. Owner must return HOLD tokens through incoming tranches with deadlines
4. If returned on time and in full, owner receives bonus HOLD tokens

Please analyze the pool description and generate:
1. A concise pool name
2. Relevant tags (up to 5)
3. A structured description
4. Pool configuration:
   - Entry/exit fees (in basis points, 1-1000)
   - Expected amounts of HOLD and RWA tokens
   - Reward percent for bonus (in basis points)
   - Time periods for entry and completion
   - AMM parameters (price impact)
   - Pool behavior flags
5. Tranches schedule:
   - Outgoing tranches: When and how much HOLD tokens owner can claim
   - Incoming tranches: When and how much HOLD tokens owner must return

Pool description: ${description}

Response format:
{
  "name": "string",
  "tags": ["string"],
  "description": "string",
  "entryFeePercent": "string (1-1000)",
  "exitFeePercent": "string (1-1000)",
  "expectedHoldAmount": "string",
  "expectedRwaAmount": "string",
  "rewardPercent": "string (1-1000)",
  "priceImpactPercent": "string (1-1000)",
  "entryPeriodStart": "number (unix timestamp)",
  "entryPeriodExpired": "number (unix timestamp)",
  "completionPeriodExpired": "number (unix timestamp)",
  "awaitCompletionExpired": "boolean",
  "floatingOutTranchesTimestamps": "boolean",
  "fixedSell": "boolean",
  "allowEntryBurn": "boolean",
  "outgoingTranches": [{
    "amount": "string",
    "timestamp": "number (unix timestamp)"
  }],
  "incomingTranches": [{
    "amount": "string",
    "expiredAt": "number (unix timestamp)"
  }]
}

Example response:
{
  "name": "Real Estate Development Fund",
  "tags": ["real-estate", "development", "construction", "yield"],
  "description": "Pool for financing a residential complex development project with quarterly returns",
  "entryFeePercent": "100",
  "exitFeePercent": "100",
  "expectedHoldAmount": "1000000000000000000000",
  "expectedRwaAmount": "1000000000000000000",
  "rewardPercent": "500",
  "priceImpactPercent": "100",
  "entryPeriodStart": 1717171717,
  "entryPeriodExpired": 1717571717,
  "completionPeriodExpired": 1727171717,
  "awaitCompletionExpired": true,
  "floatingOutTranchesTimestamps": false,
  "fixedSell": true,
  "allowEntryBurn": false,
  "outgoingTranches": [
    {"amount": "250000000000000000000", "timestamp": 1717671717},
    {"amount": "250000000000000000000", "timestamp": 1718171717},
    {"amount": "250000000000000000000", "timestamp": 1718671717},
    {"amount": "250000000000000000000", "timestamp": 1719171717}
  ],
  "incomingTranches": [
    {"amount": "275000000000000000000", "expiredAt": 1720171717},
    {"amount": "275000000000000000000", "expiredAt": 1721171717},
    {"amount": "275000000000000000000", "expiredAt": 1722171717},
    {"amount": "275000000000000000000", "expiredAt": 1723171717}
  ]
}`;

    const response = await this.openRouterClient.chatCompletion({
      model: this.openRouterModel,
      messages: [
        { role: 'system', content: systemMessage },
        {
          role: 'user',
          content: 'Please analyze the provided pool description and generate the required fields.',
        },
      ],
    });

    const aiResponse = response.choices[0]?.message?.content;
    if (!aiResponse) {
      throw new AppError({
        message: 'Failed to get AI response for pool field generation',
        statusCode: 502,
        code: 'AI_ERROR',
      });
    }

    try {
      // Find first { and last } to extract JSON object
      const firstBrace = aiResponse.indexOf('{');
      const lastBrace = aiResponse.lastIndexOf('}');

      if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
        throw new AppError({
          message: 'No valid JSON object found in AI response',
          statusCode: 502,
          code: 'AI_ERROR',
        });
      }

      const jsonString = aiResponse.substring(firstBrace, lastBrace + 1);
      return JSON.parse(jsonString);
    } catch (error) {
      throw new AppError({
        message: 'Failed to parse AI response as JSON',
        statusCode: 502,
        code: 'AI_ERROR',
        cause: error,
      });
    }
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({
      description: a[0].description,
      ownerId: a[0].ownerId,
      businessId: a[0].businessId,
      chainId: a[0].chainId,
      rwaAddress: a[0].rwaAddress,
    }),
  })
  async createPoolWithAI(data: {
    description: string;
    ownerId: string;
    ownerType: string;
    businessId: string;
    chainId: string;
    rwaAddress: string;
  }) {
    setSpanAttributes({
      ownerId: data.ownerId,
      ownerType: data.ownerType,
      entityId: data.businessId,
      entityType: 'pool',
      chainId: data.chainId,
      rwaAddress: data.rwaAddress,
    });
    if (!this.isChainIdSupported(data.chainId)) {
      throw new AppError({
        message: `Chain ID ${data.chainId} is not supported`,
        statusCode: 403,
        code: 'NOT_ALLOWED',
      });
    }

    const aiFields = await this.generatePoolFields(data.description);

    const pool = await this.poolRepository.createPool({
      name: aiFields.name,
      ownerId: data.ownerId,
      ownerType: data.ownerType,
      businessId: data.businessId,
      chainId: data.chainId,
      rwaAddress: data.rwaAddress,
      description: aiFields.description,
      tags: aiFields.tags,
      entryFeePercent: aiFields.entryFeePercent,
      exitFeePercent: aiFields.exitFeePercent,
      expectedHoldAmount: aiFields.expectedHoldAmount,
      expectedRwaAmount: aiFields.expectedRwaAmount,
      rewardPercent: aiFields.rewardPercent,
      priceImpactPercent: aiFields.priceImpactPercent,
      entryPeriodStart: aiFields.entryPeriodStart,
      entryPeriodExpired: aiFields.entryPeriodExpired,
      completionPeriodExpired: aiFields.completionPeriodExpired,
      awaitCompletionExpired: aiFields.awaitCompletionExpired,
      floatingOutTranchesTimestamps: aiFields.floatingOutTranchesTimestamps,
      fixedSell: aiFields.fixedSell,
      allowEntryBurn: aiFields.allowEntryBurn,
      outgoingTranches: aiFields.outgoingTranches,
      incomingTranches: aiFields.incomingTranches,
    });

    return this.mapPool(pool);
  }

  private isChainIdSupported(chainId: string): boolean {
    return this.supportedNetworks.some((network) => network.chainId === chainId);
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ id: a[0].id }),
  })
  async requestEvaluation({ id }: { id: string }) {
    setSpanAttributes({ entityId: id, entityType: 'pool' });
    const pool = await this.poolRepository.findById(id);

    const now = Math.floor(Date.now() / 1000);

    // An evaluation stuck "in progress" is only respected for a limited time:
    // if its request or result was lost somewhere down the chain, the flag
    // goes stale and the user can request a fresh evaluation.
    const startedAt = Number(pool.riskScoreEvaluationStartedAt || 0);
    const isStale = !startedAt || now - startedAt >= EVALUATION_STALE_AFTER_SECONDS;

    if (pool.riskScoreEvaluationProcess && !isStale) {
      throw new AppError({
        message: 'Evaluation already in progress',
        statusCode: 403,
        code: 'NOT_ALLOWED',
      });
    }

    await this.poolRepository.updatePool(id, {
      riskScoreEvaluationProcess: true,
      riskScoreEvaluationStartedAt: now,
    });

    try {
      await this.evaluationRequestsClient.publishEvaluationRequest('evaluatePool', {
        poolId: id,
        ownerId: pool.ownerId,
        ownerType: pool.ownerType,
      });
    } catch (error) {
      // The request never went out - clear the flag so the user can retry.
      await this.poolRepository.updatePool(id, {
        riskScoreEvaluationProcess: false,
        riskScoreEvaluationStartedAt: 0,
      });
      throw error;
    }

    const updated = await this.poolRepository.findById(id);
    return this.mapPool(updated);
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ id: a[0].id, riskScore: a[0].riskScore }),
  })
  async setRiskScore({ id, riskScore }: { id: string; riskScore: number }) {
    setSpanAttributes({ entityId: id, entityType: 'pool', riskScore });
    if (riskScore < 1 || riskScore > 100) {
      throw new AppError({
        message: 'riskScore must be between 1 and 100',
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    }

    const updated = await this.poolRepository.updatePool(id, {
      riskScore,
      riskScoreEvaluationProcess: false,
      riskScoreEvaluationStartedAt: 0,
    });
    return this.mapPool(updated);
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ id: a[0].id }),
  })
  async resetEvaluation({ id }: { id: string }) {
    setSpanAttributes({ entityId: id, entityType: 'pool' });
    const updated = await this.poolRepository.updatePool(id, {
      riskScoreEvaluationProcess: false,
      riskScoreEvaluationStartedAt: 0,
    });
    return this.mapPool(updated);
  }

  private generatePoolMessageHash(
    chainId: string,
    factoryAddress: string,
    deployerWallet: string,
    createPoolFeeRatio: string,
    entityId: string,
    rwa: string,
    expectedHoldAmount: string,
    expectedRwaAmount: string,
    priceImpactPercent: string,
    rewardPercent: string,
    entryPeriodStart: string,
    entryPeriodExpired: string,
    completionPeriodExpired: string,
    entryFeePercent: string,
    exitFeePercent: string,
    fixedSell: boolean,
    allowEntryBurn: boolean,
    awaitCompletionExpired: boolean,
    floatingOutTranchesTimestamps: boolean,
    outgoingTranches: Array<{
      amount: string;
      timestamp: number;
      executedAmount: string;
    }>,
    incomingTranches: Array<{
      amount: string;
      expiredAt: number;
      returnedAmount: string;
    }>,
  ): string {
    const innerHash = ethers.solidityPackedKeccak256(
      [
        'uint256',
        'address',
        'address',
        'string',
        'uint256',
        'string',
        'address',
        'uint256',
        'uint256',
        'uint256',
        'uint256',
        'uint256',
        'uint256',
        'uint256',
        'uint256',
        'uint256',
        'bool',
        'bool',
        'bool',
        'bool',
        'uint256[]',
        'uint256[]',
        'uint256[]',
        'uint256[]',
      ],
      [
        BigInt(chainId),
        ethers.getAddress(factoryAddress),
        ethers.getAddress(deployerWallet),
        'deployPool',
        BigInt(createPoolFeeRatio),
        entityId,
        ethers.getAddress(rwa),
        BigInt(expectedHoldAmount),
        BigInt(expectedRwaAmount),
        BigInt(priceImpactPercent),
        BigInt(rewardPercent),
        BigInt(entryPeriodStart),
        BigInt(entryPeriodExpired),
        BigInt(completionPeriodExpired),
        BigInt(entryFeePercent),
        BigInt(exitFeePercent),
        fixedSell,
        allowEntryBurn,
        awaitCompletionExpired,
        floatingOutTranchesTimestamps,
        outgoingTranches.map((t) => BigInt(t.amount)),
        outgoingTranches.map((t) => BigInt(t.timestamp)),
        incomingTranches.map((t) => BigInt(t.amount)),
        incomingTranches.map((t) => BigInt(t.expiredAt)),
      ],
    );

    return innerHash;
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ id: a[0].id }),
  })
  async requestApprovalSignatures(params: {
    id: string;
    ownerWallet: string;
    deployerWallet: string;
    createPoolFeeRatio: string;
  }) {
    setSpanAttributes({
      entityId: params.id,
      entityType: 'pool',
      ownerWallet: params.ownerWallet,
      deployerWallet: params.deployerWallet,
    });
    const pool = await this.poolRepository.findById(params.id);

    if (pool.approvalSignaturesTaskId) {
      throw new AppError({
        message: 'Pool already has an active approval signatures task',
        statusCode: 403,
        code: 'NOT_ALLOWED',
      });
    }

    if (!pool.expectedHoldAmount || BigInt(pool.expectedHoldAmount) <= BigInt(0)) {
      throw new AppError({
        message: 'expectedHoldAmount must be greater than 0',
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    }

    if (!pool.expectedRwaAmount || BigInt(pool.expectedRwaAmount) <= BigInt(0)) {
      throw new AppError({
        message: 'expectedRwaAmount must be greater than 0',
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    }

    if (!pool.priceImpactPercent || BigInt(pool.priceImpactPercent) <= BigInt(0)) {
      throw new AppError({
        message: 'priceImpactPercent must be greater than 0',
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    }

    if (!pool.rewardPercent || BigInt(pool.rewardPercent) <= BigInt(0)) {
      throw new AppError({
        message: 'rewardPercent must be greater than 0',
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    }

    if (!pool.entryPeriodStart || pool.entryPeriodStart <= 0) {
      throw new AppError({
        message: 'entryPeriodStart must be greater than 0',
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    }

    if (!pool.entryPeriodExpired || pool.entryPeriodExpired <= pool.entryPeriodStart) {
      throw new AppError({
        message: 'entryPeriodExpired must be greater than entryPeriodStart',
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    }

    if (!pool.completionPeriodExpired || pool.completionPeriodExpired <= pool.entryPeriodExpired) {
      throw new AppError({
        message: 'completionPeriodExpired must be greater than entryPeriodExpired',
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    }

    if (!pool.entryFeePercent) {
      throw new AppError({
        message: 'entryFeePercent is required',
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    }

    if (!pool.exitFeePercent) {
      throw new AppError({
        message: 'exitFeePercent is required',
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const expired = now + 86400; // 24 hours

    const network = this.supportedNetworks.find((n) => n.chainId === pool.chainId);
    if (!network) {
      throw new AppError({
        message: `Network configuration not found for chain ID ${pool.chainId}`,
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    }

    const messageHash = this.generatePoolMessageHash(
      pool.chainId,
      network.factoryAddress,
      params.deployerWallet,
      params.createPoolFeeRatio,
      params.id,
      pool.rwaAddress,
      pool.expectedHoldAmount,
      pool.expectedRwaAmount,
      pool.priceImpactPercent,
      pool.rewardPercent,
      pool.entryPeriodStart.toString(),
      pool.entryPeriodExpired.toString(),
      pool.completionPeriodExpired.toString(),
      pool.entryFeePercent,
      pool.exitFeePercent,
      pool.fixedSell,
      pool.allowEntryBurn,
      pool.awaitCompletionExpired,
      pool.floatingOutTranchesTimestamps,
      pool.outgoingTranches,
      pool.incomingTranches,
    );

    const taskResponse = await this.signersManagerClient.createSignatureTask.post({
      ownerId: pool.ownerId,
      ownerType: pool.ownerType,
      hash: messageHash,
      expired,
      requiredSignatures: 3,
    });

    if (taskResponse.error) throw taskResponse.error;

    const taskId = taskResponse.data.id;

    await this.poolRepository.updatePool(params.id, {
      approvalSignaturesTaskId: taskId,
      approvalSignaturesTaskExpired: expired,
    });
    return { taskId };
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ id: a[0] }),
  })
  async rejectApprovalSignatures(id: string) {
    setSpanAttributes({ entityId: id, entityType: 'pool' });
    const pool = await this.poolRepository.findById(id);

    if (pool.poolAddress) {
      throw new AppError({ message: 'Pool deployed!', statusCode: 403, code: 'NOT_ALLOWED' });
    }

    if (!pool.approvalSignaturesTaskId || !pool.approvalSignaturesTaskExpired) {
      throw new AppError({
        message: 'Pool has no active approval signatures task',
        statusCode: 403,
        code: 'NOT_ALLOWED',
      });
    }

    const now = Math.floor(Date.now() / 1000);
    if (now <= pool.approvalSignaturesTaskExpired + 60) {
      throw new AppError({
        message: 'Cannot reject approval signatures before expiration',
        statusCode: 403,
        code: 'NOT_ALLOWED',
      });
    }

    await this.poolRepository.updatePool(id, {
      approvalSignaturesTaskId: null,
      approvalSignaturesTaskExpired: null,
    });
  }

  private mapPool(pool: any) {
    return {
      id: pool._id.toString(),
      chainId: pool.chainId,
      name: pool.name,
      image: pool.image ?? undefined,
      imageUrl: pool.image ? buildFileUrl(pool.image, this.filesBaseUrl) : undefined,
      fileId: pool.fileId ?? undefined,
      ownerId: pool.ownerId,
      ownerType: pool.ownerType,
      businessId: pool.businessId,
      poolAddress: pool.poolAddress ?? undefined,
      holdToken: pool.holdToken ?? undefined,
      rwaAddress: pool.rwaAddress,
      tokenId: pool.tokenId ?? undefined,
      entryFeePercent: pool.entryFeePercent ?? undefined,
      exitFeePercent: pool.exitFeePercent ?? undefined,
      expectedHoldAmount: pool.expectedHoldAmount ?? undefined,
      expectedRwaAmount: pool.expectedRwaAmount ?? undefined,
      expectedBonusAmount: pool.expectedBonusAmount ?? undefined,
      rewardPercent: pool.rewardPercent ?? undefined,
      entryPeriodStart: pool.entryPeriodStart ?? undefined,
      entryPeriodExpired: pool.entryPeriodExpired ?? undefined,
      completionPeriodExpired: pool.completionPeriodExpired ?? undefined,
      awaitCompletionExpired: pool.awaitCompletionExpired ?? false,
      floatingOutTranchesTimestamps: pool.floatingOutTranchesTimestamps ?? false,
      fixedSell: pool.fixedSell ?? false,
      allowEntryBurn: pool.allowEntryBurn ?? false,
      priceImpactPercent: pool.priceImpactPercent ?? undefined,
      liquidityCoefficient: pool.liquidityCoefficient ?? undefined,
      k: pool.k ?? undefined,
      realHoldReserve: pool.realHoldReserve ?? '0',
      virtualHoldReserve: pool.virtualHoldReserve ?? undefined,
      virtualRwaReserve: pool.virtualRwaReserve ?? undefined,
      floatingTimestampOffset: pool.floatingTimestampOffset ?? 0,
      isTargetReached: pool.isTargetReached ?? false,
      isFullyReturned: pool.isFullyReturned ?? false,
      fullReturnTimestamp: pool.fullReturnTimestamp ?? undefined,
      totalClaimedAmount: pool.totalClaimedAmount ?? '0',
      totalReturnedAmount: pool.totalReturnedAmount ?? '0',
      awaitingBonusAmount: pool.awaitingBonusAmount ?? '0',
      awaitingRwaAmount: pool.awaitingRwaAmount ?? '0',
      rewardedRwaAmount: pool.rewardedRwaAmount ?? '0',
      outgoingTranchesBalance: pool.outgoingTranchesBalance ?? '0',
      outgoingTranches: pool.outgoingTranches ?? [],
      incomingTranches: pool.incomingTranches ?? [],
      lastCompletedIncomingTranche: pool.lastCompletedIncomingTranche ?? 0,
      paused: pool.paused ?? false,
      description: pool.description,
      tags: pool.tags ?? [],
      riskScore: pool.riskScore ?? undefined,
      approvalSignaturesTaskId: pool.approvalSignaturesTaskId ?? undefined,
      approvalSignaturesTaskExpired: pool.approvalSignaturesTaskExpired ?? undefined,
      riskScoreEvaluationProcess: pool.riskScoreEvaluationProcess,
      createdAt: pool.createdAt,
      updatedAt: pool.updatedAt,
    };
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ id: a[0] }),
  })
  async getPool(id: string) {
    setSpanAttributes({ entityId: id, entityType: 'pool' });
    const pool = await this.poolRepository.findById(id);
    return this.mapPool(pool);
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({
      ownerId: a[0].ownerId,
      businessId: a[0].businessId,
      chainId: a[0].chainId,
      rwaAddress: a[0].rwaAddress,
    }),
  })
  async createPool(data: {
    ownerId: string;
    ownerType: string;
    name: string;
    chainId: string;
    businessId: string;
    rwaAddress: string;
    entryFeePercent?: string;
    exitFeePercent?: string;
    expectedHoldAmount?: string;
    expectedRwaAmount?: string;
    rewardPercent?: string;
    entryPeriodStart?: number;
    entryPeriodExpired?: number;
    completionPeriodExpired?: number;
    awaitCompletionExpired?: boolean;
    floatingOutTranchesTimestamps?: boolean;
    fixedSell?: boolean;
    allowEntryBurn?: boolean;
    priceImpactPercent?: string;
    outgoingTranches?: Array<{
      amount: string;
      timestamp: number;
      executedAmount: string;
    }>;
    incomingTranches?: Array<{
      amount: string;
      expiredAt: number;
      returnedAmount: string;
    }>;
    description?: string;
    tags?: string[];
    image?: string;
  }) {
    setSpanAttributes({
      ownerId: data.ownerId,
      ownerType: data.ownerType,
      entityId: data.businessId,
      entityType: 'pool',
      chainId: data.chainId,
      rwaAddress: data.rwaAddress,
    });
    if (!this.isChainIdSupported(data.chainId)) {
      throw new AppError({
        message: `Chain ID ${data.chainId} is not supported`,
        statusCode: 403,
        code: 'NOT_ALLOWED',
      });
    }

    const pool = await this.poolRepository.createPool(data);

    return this.mapPool(pool);
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ id: a[0].id }),
  })
  async updatePoolImage(params: { id: string; image: string; fileId: string }) {
    setSpanAttributes({ entityId: params.id, entityType: 'pool' });
    const updated = await this.poolRepository.updatePool(params.id, { image: params.image, fileId: params.fileId });
    return this.mapPool(updated);
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ id: a[0].id }),
  })
  async editPool(params: {
    id: string;
    updateData: {
      chainId?: string;
      name?: string;
      entryFeePercent?: string;
      exitFeePercent?: string;
      expectedHoldAmount?: string;
      expectedRwaAmount?: string;
      rewardPercent?: string;
      entryPeriodStart?: number;
      entryPeriodExpired?: number;
      completionPeriodExpired?: number;
      awaitCompletionExpired?: boolean;
      floatingOutTranchesTimestamps?: boolean;
      fixedSell?: boolean;
      allowEntryBurn?: boolean;
      priceImpactPercent?: string;
      outgoingTranches?: Array<{
        amount: string;
        timestamp: number;
        executedAmount: string;
      }>;
      incomingTranches?: Array<{
        amount: string;
        expiredAt: number;
        returnedAmount: string;
      }>;
      description?: string;
      tags?: string[];
      image?: string;
    };
  }) {
    setSpanAttributes({
      entityId: params.id,
      entityType: 'pool',
      ...(params.updateData.chainId !== undefined && { chainId: params.updateData.chainId }),
    });
    const pool = await this.poolRepository.findById(params.id);

    if (pool.approvalSignaturesTaskId) {
      const immutableFields = [
        'chainId',
        'entryFeePercent',
        'exitFeePercent',
        'expectedHoldAmount',
        'expectedRwaAmount',
        'rewardPercent',
        'entryPeriodStart',
        'entryPeriodExpired',
        'completionPeriodExpired',
        'awaitCompletionExpired',
        'floatingOutTranchesTimestamps',
        'fixedSell',
        'allowEntryBurn',
        'priceImpactPercent',
        'outgoingTranches',
        'incomingTranches',
      ];

      for (const field of immutableFields) {
        if (params.updateData[field as keyof typeof params.updateData] !== undefined) {
          throw new AppError({
            message: `Cannot edit ${field} while approval signatures task is pending`,
            statusCode: 403,
            code: 'NOT_ALLOWED',
          });
        }
      }
    }

    const updated = await this.poolRepository.updatePool(params.id, params.updateData);
    return this.mapPool(updated);
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ entityId: a[0].entityId, poolAddress: a[0].emittedFrom }),
  })
  async syncPoolAfterDeployment(event: {
    emittedFrom: string;
    awaitCompletionExpired: boolean;
    floatingOutTranchesTimestamps: boolean;
    holdToken: string;
    rwaToken: string;
    tokenId: string;
    entityId: string;
    entityOwnerId: string;
    entityOwnerType: string;
    owner: string;
    expectedHoldAmount: string;
    expectedRwaAmount: string;
    expectedBonusAmount: string;
    rewardPercent: string;
    fixedSell: boolean;
    allowEntryBurn: boolean;
    entryPeriodStart: string;
    entryPeriodExpired: string;
    completionPeriodExpired: string;
    k: string;
    entryFeePercent: string;
    exitFeePercent: string;
    outgoingTranches: string[];
    outgoingTranchTimestamps: number[];
    incomingTranches: string[];
    incomingTrancheExpired: number[];
  },
  meta?: { sourceId?: string }) {
    setSpanAttributes({
      entityId: event.entityId,
      entityType: 'pool',
      poolAddress: event.emittedFrom,
      rwaAddress: event.rwaToken,
      tokenId: event.tokenId,
      ownerWallet: event.owner,
    });
    const pool = await this.poolRepository.findById(event.entityId);
    if (!pool) {
      throw new AppError({
        message: `Pool ${event.entityId} not found`,
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    }

    const updateData: any = {
      poolAddress: event.emittedFrom,
      holdToken: event.holdToken,
      rwaAddress: event.rwaToken,
      tokenId: event.tokenId,
      floatingOutTranchesTimestamps: event.floatingOutTranchesTimestamps,
      awaitCompletionExpired: event.awaitCompletionExpired,
      ownerWallet: event.owner,
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
      outgoingTranches: event.outgoingTranches.map((amount, i) => ({
        amount,
        timestamp: event.outgoingTranchTimestamps[i],
        executedAmount: '0',
      })),
      incomingTranches: event.incomingTranches.map((amount, i) => ({
        amount,
        expiredAt: event.incomingTrancheExpired[i],
        returnedAmount: '0',
      })),
    };

    const updated = await this.poolRepository.updatePool(event.entityId, updateData);
    const poolDto = this.mapPool(updated);

    await this.poolEventsClient.publishPoolDeployed(poolDto);

    await this.webhookEventsPublisher.publish(
      'pool.deployed',
      {
        poolId: poolDto.id,
        poolAddress: poolDto.poolAddress,
        ownerId: poolDto.ownerId,
        ownerWallet: event.owner,
        holdToken: poolDto.holdToken,
        rwaAddress: poolDto.rwaAddress,
        tokenId: poolDto.tokenId,
        expectedHoldAmount: poolDto.expectedHoldAmount,
        expectedRwaAmount: poolDto.expectedRwaAmount,
      },
      meta?.sourceId,
    );

    return poolDto;
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ poolAddress: a[0].emittedFrom, awaitingRwaAmount: a[0].awaitingRwaAmount }),
  })
  async syncPoolAwaitingRwaAmount(event: { emittedFrom: string; awaitingRwaAmount: string }) {
    setSpanAttributes({ entityType: 'pool', poolAddress: event.emittedFrom });
    const updated = await this.poolRepository.updatePoolByAddress(event.emittedFrom, {
      awaitingRwaAmount: event.awaitingRwaAmount,
    });
    return this.mapPool(updated);
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ poolAddress: a[0].emittedFrom, timestamp: a[0].timestamp }),
  })
  async syncPoolFundsFullyReturned(event: { emittedFrom: string; timestamp: string }) {
    setSpanAttributes({ entityType: 'pool', poolAddress: event.emittedFrom });
    const updated = await this.poolRepository.updatePoolByAddress(event.emittedFrom, {
      isFullyReturned: true,
      fullReturnTimestamp: Number(event.timestamp),
    });
    return this.mapPool(updated);
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({
      poolAddress: a[0].emittedFrom,
      currentAwaitingBonusAmount: a[0].currentAwaitingBonusAmount,
      currentRewardedRwaAmount: a[0].currentRewardedRwaAmount,
    }),
  })
  async syncPoolBonusWithdrawn(event: {
    emittedFrom: string;
    currentAwaitingBonusAmount: string;
    currentRewardedRwaAmount: string;
  }) {
    setSpanAttributes({ entityType: 'pool', poolAddress: event.emittedFrom });
    const updated = await this.poolRepository.updatePoolByAddress(event.emittedFrom, {
      awaitingBonusAmount: event.currentAwaitingBonusAmount,
      rewardedRwaAmount: event.currentRewardedRwaAmount,
    });
    return this.mapPool(updated);
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({
      poolAddress: a[0].emittedFrom,
      currentTotalReturnedAmount: a[0].currentTotalReturnedAmount,
    }),
  })
  async syncPoolIncomingReturnSummary(event: {
    emittedFrom: string;
    currentTotalReturnedAmount: string;
    currentAwaitingBonusAmount: string;
    currentLastCompletedIncomingTranche: number;
  }) {
    setSpanAttributes({ entityType: 'pool', poolAddress: event.emittedFrom });
    const updated = await this.poolRepository.updatePoolByAddress(event.emittedFrom, {
      totalReturnedAmount: event.currentTotalReturnedAmount,
      awaitingBonusAmount: event.currentAwaitingBonusAmount,
      lastCompletedIncomingTranche: event.currentLastCompletedIncomingTranche,
    });
    return this.mapPool(updated);
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({
      poolAddress: a[0].emittedFrom,
      trancheIndex: a[0].trancheIndex,
      isNowComplete: a[0].isNowComplete,
    }),
  })
  async syncPoolIncomingTrancheUpdate(event: {
    emittedFrom: string;
    trancheIndex: number;
    amountAppliedToTranche: string;
    isNowComplete: boolean;
    wasOnTime: boolean;
  }) {
    setSpanAttributes({ entityType: 'pool', poolAddress: event.emittedFrom });
    const pool = await this.poolRepository.findByAddress(event.emittedFrom);
    if (!pool) {
      throw new AppError({
        message: `Pool with address ${event.emittedFrom} not found`,
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    }

    const incomingTranches = [...pool.incomingTranches];
    if (event.trancheIndex >= incomingTranches.length) {
      throw new AppError({
        message: `Invalid tranche index ${event.trancheIndex}`,
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    }

    // Pool_IncomingTrancheUpdate carries the amount applied by this call, not
    // the cumulative tranche state. Accumulate it in the read model so a
    // tranche returned in multiple calls is represented correctly.
    const tranche = incomingTranches[event.trancheIndex];
    const currentReturnedAmount = BigInt(tranche.returnedAmount || '0');
    const appliedAmount = BigInt(event.amountAppliedToTranche);
    const nextReturnedAmount = currentReturnedAmount + appliedAmount;

    if (nextReturnedAmount > BigInt(tranche.amount)) {
      throw new AppError({
        message: `Incoming tranche ${event.trancheIndex} returned amount exceeds tranche amount`,
        statusCode: 502,
        code: 'BLOCKCHAIN_ERROR',
      });
    }

    tranche.returnedAmount = nextReturnedAmount.toString();

    const updated = await this.poolRepository.updatePoolByAddress(event.emittedFrom, {
      incomingTranches,
    });
    return this.mapPool(updated);
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({
      poolAddress: a[0].emittedFrom,
      currentTotalClaimedAmount: a[0].currentTotalClaimedAmount,
    }),
  })
  async syncPoolOutgoingClaimSummary(event: {
    emittedFrom: string;
    currentTotalClaimedAmount: string;
    currentOutgoingTranchesBalance: string;
  }) {
    setSpanAttributes({ entityType: 'pool', poolAddress: event.emittedFrom });
    const updated = await this.poolRepository.updatePoolByAddress(event.emittedFrom, {
      totalClaimedAmount: event.currentTotalClaimedAmount,
      outgoingTranchesBalance: event.currentOutgoingTranchesBalance,
    });
    return this.mapPool(updated);
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({
      poolAddress: a[0].emittedFrom,
      trancheIndex: a[0].trancheIndex,
      amountClaimed: a[0].amountClaimed,
    }),
  })
  async syncPoolOutgoingTrancheClaimed(event: { emittedFrom: string; trancheIndex: number; amountClaimed: string }) {
    setSpanAttributes({ entityType: 'pool', poolAddress: event.emittedFrom });
    const pool = await this.poolRepository.findByAddress(event.emittedFrom);
    if (!pool) {
      throw new AppError({
        message: `Pool with address ${event.emittedFrom} not found`,
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    }

    const outgoingTranches = [...pool.outgoingTranches];
    if (event.trancheIndex >= outgoingTranches.length) {
      throw new AppError({
        message: `Invalid tranche index ${event.trancheIndex}`,
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    }

    outgoingTranches[event.trancheIndex].executedAmount = event.amountClaimed;

    const updated = await this.poolRepository.updatePoolByAddress(event.emittedFrom, {
      outgoingTranches,
    });
    return this.mapPool(updated);
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ poolAddress: a[0].emittedFrom, isPaused: a[0].isPaused }),
  })
  async syncPoolPausedState(event: { emittedFrom: string; isPaused: boolean }) {
    setSpanAttributes({ entityType: 'pool', poolAddress: event.emittedFrom });
    const updated = await this.poolRepository.updatePoolByAddress(event.emittedFrom, {
      paused: event.isPaused,
    });
    return this.mapPool(updated);
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({
      poolAddress: a[0].emittedFrom,
      realHoldReserve: a[0].realHoldReserve,
    }),
  })
  async syncPoolReserves(event: {
    emittedFrom: string;
    realHoldReserve: string;
    virtualHoldReserve: string;
    virtualRwaReserve: string;
  }) {
    setSpanAttributes({ entityType: 'pool', poolAddress: event.emittedFrom });
    const updated = await this.poolRepository.updatePoolByAddress(event.emittedFrom, {
      realHoldReserve: event.realHoldReserve,
      virtualHoldReserve: event.virtualHoldReserve,
      virtualRwaReserve: event.virtualRwaReserve,
    });
    return this.mapPool(updated);
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ poolAddress: a[0].emittedFrom }),
  })
  async syncPoolTargetReached(event: {
    emittedFrom: string;
    outgoingTranchesBalance: string;
    floatingTimestampOffset: number;
  }) {
    setSpanAttributes({ entityType: 'pool', poolAddress: event.emittedFrom });
    const updated = await this.poolRepository.updatePoolByAddress(event.emittedFrom, {
      isTargetReached: true,
      outgoingTranchesBalance: event.outgoingTranchesBalance,
      floatingTimestampOffset: event.floatingTimestampOffset,
    });
    return this.mapPool(updated);
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ limit: a[0].limit, offset: a[0].offset }),
  })
  async getPools(params: {
    filter?: Record<string, any>;
    sort?: { [key: string]: SortOrder };
    limit?: number;
    offset?: number;
  }) {
    const filterJson = params.filter ? JSON.stringify(params.filter) : undefined;
    setSpanAttributes({
      entityType: 'pool',
      ...(filterJson !== undefined && { filter: filterJson }),
      ...(params.limit !== undefined && { limit: params.limit }),
      ...(params.offset !== undefined && { offset: params.offset }),
    });
    const pools = await this.poolRepository.findAll(params.filter, params.sort, params.limit, params.offset);
    return pools.map((pool) => this.mapPool(pool));
  }
}
