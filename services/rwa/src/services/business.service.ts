import { BusinessRepository } from '../repositories/business.repository';
import type { AiEvaluatorClient } from '../clients/aiEvaluator.client';
import type { BlockchainEvent } from '@shared/blockchain';
import { AppError } from '@shared/errors/app-errors';
import type { IBusinessEntity } from '../models/entity/business.entity';

import { OpenRouterClient } from '@shared/openrouter/client';
import { ethers } from 'ethers';
import type { SortOrder } from 'mongoose';
import type { SignersManagerClient } from '../clients/eden.clients';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import { MetricsDecorator } from '@shared/monitoring/src/metricsDecorator';
import { LogDecorator } from '@shared/monitoring/src/logDecorator';
import { setSpanAttributes } from '@shared/monitoring/src/tracing';
import { buildFileUrl } from '@shared/files/src/index';

interface NetworkConfig {
  chainId: string;
  name: string;
  factoryAddress: string;
}

// An evaluation stuck "in progress" longer than this (seconds) is considered
// stale - its request or result was lost on the way - and may be requested again.
const EVALUATION_STALE_AFTER_SECONDS = 60 * 60;

export class BusinessService {
  constructor(
    private readonly businessRepository: BusinessRepository,
    private readonly openRouterClient: OpenRouterClient,
    private readonly signersManagerClient: SignersManagerClient,
    private readonly aiEvaluatorClient: AiEvaluatorClient,
    private readonly supportedNetworks: NetworkConfig[],
    private readonly openRouterModel: string,
    private readonly filesBaseUrl: string,
  ) {}

  private isChainIdSupported(chainId: string): boolean {
    return this.supportedNetworks.some((network) => network.chainId === chainId);
  }

  private generateMessageHash(
    chainId: string,
    factoryAddress: string,
    deployerWallet: string,
    createRWAFee: string,
    entityId: string,
    entityOwnerId: string,
    entityOwnerType: string,
    owner: string,
  ): string {
    const paramsHash = ethers.solidityPackedKeccak256(
      ['uint256', 'address', 'address', 'string', 'uint256', 'string', 'string', 'string', 'address'],
      [
        BigInt(chainId),
        ethers.getAddress(factoryAddress),
        ethers.getAddress(deployerWallet),
        'deployRWA',
        BigInt(createRWAFee),
        entityId,
        entityOwnerId,
        entityOwnerType,
        ethers.getAddress(owner),
      ],
    );

    return paramsHash;
  }

  private async generateBusinessFields(description: string) {
    const systemMessage = `You are a business analyst. Analyze the following business description and generate:
1. A concise business name
2. Relevant tags (up to 5)
3. A structured description

Business description: ${description}

Response format:
{
  "name": "string",
  "tags": ["string"],
  "description": "string",
}`;

    const response = await this.openRouterClient.chatCompletion({
      model: this.openRouterModel,
      messages: [
        { role: 'system', content: systemMessage },
        {
          role: 'user',
          content: 'Please analyze the provided business description and generate the required fields.',
        },
      ],
    });

    const aiResponse = response.choices[0]?.message?.content;
    if (!aiResponse) {
      throw new AppError({
        message: 'Failed to get AI response for business field generation',
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
      ownerType: a[0].ownerType,
      chainId: a[0].chainId,
    }),
  })
  async createBusinessWithAI(data: { description: string; ownerId: string; ownerType: string; chainId: string }) {
    setSpanAttributes({
      ownerId: data.ownerId,
      ownerType: data.ownerType,
      chainId: data.chainId,
    });
    if (!this.isChainIdSupported(data.chainId)) {
      throw new AppError({
        message: `Chain ID ${data.chainId} is not supported`,
        statusCode: 403,
        code: 'NOT_ALLOWED',
      });
    }

    const aiFields = await this.generateBusinessFields(data.description);

    const business = await this.businessRepository.createBusiness({
      name: aiFields.name,
      ownerId: data.ownerId,
      ownerType: data.ownerType,
      chainId: data.chainId,
      description: aiFields.description,
      tags: aiFields.tags,
    });

    return this.mapBusiness(business);
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({
      description: a[0].description,
      ownerId: a[0].ownerId,
      ownerType: a[0].ownerType,
      chainId: a[0].chainId,
    }),
  })
  async createBusiness(data: {
    name: string;
    ownerId: string;
    ownerType: string;
    chainId: string;
    description?: string;
    tags?: string[];
    image?: string;
    country?: string;
    businessType?: string;
    socials?: { type: string; url: string }[];
  }) {
    setSpanAttributes({
      ownerId: data.ownerId,
      ownerType: data.ownerType,
      chainId: data.chainId,
    });
    if (!this.isChainIdSupported(data.chainId)) {
      throw new AppError({
        message: `Chain ID ${data.chainId} is not supported`,
        statusCode: 403,
        code: 'NOT_ALLOWED',
      });
    }

    const business = await this.businessRepository.createBusiness(
      data as Parameters<typeof this.businessRepository.createBusiness>[0],
    );

    return this.mapBusiness(business);
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ id: a[0].id }),
  })
  async updateBusinessImage(params: { id: string; image: string; fileId: string }) {
    setSpanAttributes({ entityId: params.id, entityType: 'business' });
    const updated = await this.businessRepository.updateBusiness(params.id, {
      image: params.image,
      fileId: params.fileId,
    });
    return this.mapBusiness(updated);
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ id: a[0].id }),
  })
  async editBusiness(params: {
    id: string;
    updateData: {
      chainId?: string;
      name?: string;
      description?: string;
      tags?: string[];
      image?: string;
      country?: string;
      businessType?: string;
      socials?: { type: string; url: string }[];
    };
  }) {
    setSpanAttributes({
      entityId: params.id,
      entityType: 'business',
      ...(params.updateData.chainId !== undefined && { chainId: params.updateData.chainId }),
    });
    const business = await this.businessRepository.findById(params.id);

    if (business.approvalSignaturesTaskId) {
      const immutableFields = ['chainId'];

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

    const updated = await this.businessRepository.updateBusiness(
      params.id,
      params.updateData as Parameters<typeof this.businessRepository.updateBusiness>[1],
    );

    return this.mapBusiness(updated);
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ id: a[0].id }),
  })
  async requestEvaluation({ id }: { id: string }) {
    setSpanAttributes({ entityId: id, entityType: 'business' });
    const business = await this.businessRepository.findById(id);

    const now = Math.floor(Date.now() / 1000);

    // An evaluation stuck "in progress" is only respected for a limited time:
    // if its request or result was lost somewhere down the chain, the flag
    // goes stale and the user can request a fresh evaluation.
    const startedAt = Number(business.riskScoreEvaluationStartedAt || 0);
    const isStale = !startedAt || now - startedAt >= EVALUATION_STALE_AFTER_SECONDS;

    if (business.riskScoreEvaluationProcess && !isStale) {
      throw new AppError({
        message: 'Evaluation already in progress',
        statusCode: 403,
        code: 'NOT_ALLOWED',
      });
    }

    const response = await this.aiEvaluatorClient.createBusinessEvaluation.post({
      businessId: id,
      ownerId: business.ownerId,
      ownerType: business.ownerType,
    });

    if (response.error) {
      throw new AppError({
        message: `ai-evaluator is unavailable (${response.status})`,
        statusCode: 502,
        code: 'AI_ERROR',
      });
    }

    await this.businessRepository.updateBusiness(id, {
      riskScoreEvaluationProcess: true,
      riskScoreEvaluationStartedAt: now,
    });

    const updated = await this.businessRepository.findById(id);
    return this.mapBusiness(updated);
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ id: a[0].id, riskScore: a[0].riskScore }),
  })
  async setRiskScore({ id, riskScore }: { id: string; riskScore: number }) {
    setSpanAttributes({ entityId: id, entityType: 'business', riskScore });
    if (riskScore < 1 || riskScore > 100) {
      throw new AppError({
        message: 'riskScore must be between 1 and 100',
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    }

    const updated = await this.businessRepository.updateBusiness(id, {
      riskScore,
      riskScoreEvaluationProcess: false,
      riskScoreEvaluationStartedAt: 0,
    });

    return this.mapBusiness(updated);
  }

  /**
   * Applies an evaluation result delivered back by the ai-evaluator service.
   *
   * Only a completed evaluation reaches this method: the evaluator retries its
   * job and parks it instead of reporting a failure.
   */
  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({
      evaluationId: a[0].evaluationId,
      entityId: a[0].entityId,
    }),
  })
  async applyEvaluationResult(result: {
    evaluationId: string;
    entityType: 'business';
    entityId: string;
    riskScore: number;
  }) {
    return this.setRiskScore({ id: result.entityId, riskScore: result.riskScore });
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ 
      id: a[0].id,
      ownerWallet: a[0].ownerWallet,
      deployerWallet: a[0].deployerWallet,
      createRWAFee: a[0].createRWAFee,
    }),
  })
  async requestApprovalSignatures(params: {
    id: string;
    ownerWallet: string;
    deployerWallet: string;
    createRWAFee: string;
  }) {
    setSpanAttributes({
      entityId: params.id,
      entityType: 'business',
      ownerWallet: params.ownerWallet,
      deployerWallet: params.deployerWallet,
    });
    const business = await this.businessRepository.findById(params.id);

    if (business.approvalSignaturesTaskId) {
      throw new AppError({
        message: 'Business already has an active approval signatures task',
        statusCode: 403,
        code: 'NOT_ALLOWED',
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const expired = now + 86400; // 24 hours

    const network = this.supportedNetworks.find((n) => n.chainId === business.chainId);
    if (!network) {
      throw new AppError({
        message: `Network configuration not found for chain ID ${business.chainId}`,
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    }

    const messageHash = this.generateMessageHash(
      business.chainId,
      network.factoryAddress,
      params.deployerWallet,
      params.createRWAFee,
      params.id,
      business.ownerId,
      business.ownerType,
      params.ownerWallet,
    );

    const taskResponse = await this.signersManagerClient.createSignatureTask.post({
      ownerId: business.ownerId,
      ownerType: business.ownerType,
      hash: messageHash,
      expired,
      requiredSignatures: 3,
    });

    if (taskResponse.error) throw taskResponse.error;

    const taskId = taskResponse.data.id;

    await this.businessRepository.updateBusiness(params.id, {
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
    setSpanAttributes({ entityId: id, entityType: 'business' });
    const business = await this.businessRepository.findById(id);

    if (business.tokenAddress) {
      throw new AppError({
        message: 'Business already deployed!',
        statusCode: 403,
        code: 'NOT_ALLOWED',
      });
    }

    if (!business.approvalSignaturesTaskId || !business.approvalSignaturesTaskExpired) {
      throw new AppError({
        message: 'Business has no active approval signatures task',
        statusCode: 403,
        code: 'NOT_ALLOWED',
      });
    }

    const now = Math.floor(Date.now() / 1000);
    if (now <= business.approvalSignaturesTaskExpired + 60) {
      throw new AppError({
        message: 'Cannot reject approval signatures before expiration',
        statusCode: 403,
        code: 'NOT_ALLOWED',
      });
    }

    await this.businessRepository.updateBusiness(id, {
      approvalSignaturesTaskId: undefined,
    });
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ entityId: a[0].data.entityId, emittedFrom: a[0].data.emittedFrom, owner: a[0].data.owner }),
  })
  async syncAfterDeployment(event: BlockchainEvent<{
    entityId: string; emittedFrom: string; owner: string
  }>) {
    setSpanAttributes({
      entityId: event.data.entityId,
      entityType: 'business',
      tokenAddress: event.data.emittedFrom,
      ownerWallet: event.data.owner,
    });
    const updated = await this.businessRepository.updateBusiness(event.data.entityId, {
      tokenAddress: event.data.emittedFrom,
      ownerWallet: event.data.owner,
    });

    const businessDto = this.mapBusiness(updated);

    return businessDto;
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ tokenAddress: a[0].data.emittedFrom, isPaused: a[0].data.isPaused }),
  })
  async syncPausedState(event: BlockchainEvent<{
    emittedFrom: string; isPaused: boolean
  }>) {
    setSpanAttributes({ entityType: 'business', tokenAddress: event.data.emittedFrom });
    const updated = await this.businessRepository.updateBusinessByTokenAddress(event.data.emittedFrom, {
      paused: event.data.isPaused,
    });
    return this.mapBusiness(updated);
  }

  private mapBusiness(business: IBusinessEntity) {
    return {
      id: business._id.toString(),
      chainId: business.chainId,
      name: business.name,
      ownerId: business.ownerId,
      ownerType: business.ownerType,
      ownerWallet: business.ownerWallet ?? undefined,
      tokenAddress: business.tokenAddress ?? undefined,
      description: business.description,
      tags: business.tags,
      riskScore: business.riskScore ?? undefined,
      image: business.image ?? undefined,
      imageUrl: business.image ? buildFileUrl(business.image, this.filesBaseUrl) : undefined,
      fileId: business.fileId ?? undefined,
      approvalSignaturesTaskId: business.approvalSignaturesTaskId ?? undefined,
      approvalSignaturesTaskExpired: business.approvalSignaturesTaskExpired ?? undefined,
      riskScoreEvaluationProcess: business.riskScoreEvaluationProcess,
      country: business.country ?? undefined,
      businessType: business.businessType ?? undefined,
      socials: business.socials ?? [],
      paused: business.paused,
      createdAt: business.createdAt,
      updatedAt: business.updatedAt,
    };
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ id: a[0] }),
  })
  async getBusiness(id: string) {
    setSpanAttributes({ entityId: id, entityType: 'business' });
    const business = await this.businessRepository.findById(id);
    return this.mapBusiness(business);
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ id: a[0].id, limit: a[0].limit, offset: a[0].offset }),
  })
  async getBusinesses(params: {
    filter?: Record<string, any>;
    sort?: { [key: string]: SortOrder };
    limit?: number;
    offset?: number;
  }) {
    const filterJson = params.filter ? JSON.stringify(params.filter) : undefined;
    setSpanAttributes({
      entityType: 'business',
      ...(filterJson !== undefined && { filter: filterJson }),
      ...(params.limit !== undefined && { limit: params.limit }),
      ...(params.offset !== undefined && { offset: params.offset }),
    });
    const businesses = await this.businessRepository.findAll(params.filter, params.sort, params.limit, params.offset);
    return businesses.map((b) => this.mapBusiness(b));
  }
}
