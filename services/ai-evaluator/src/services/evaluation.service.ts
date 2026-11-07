import mongoose, { Types } from 'mongoose';
import type { SortOrder } from 'mongoose';
import { AppError } from '@shared/errors/app-errors';
import { OpenRouterClient } from '@shared/openrouter/client';
import type { FileContentPart, ImageContentPart } from '@shared/openrouter/types';
import type { OutboxPublisherService } from '@shared/outbox-publisher';
import type { RabbitMQClient } from '../clients/rabbitmq.client';
import type { EvaluationRepository } from '../repositories/evaluation.repository';
import type {
  RwaClient,
  DocumentsClient,
  GalleryClient,
  ReactionsClient,
  QuestionsClient,
  PortfolioClient,
} from '../clients/eden.clients';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import { MetricsDecorator } from '@shared/monitoring/src/metricsDecorator';
import { LogDecorator } from '@shared/monitoring/src/logDecorator';
import { setSpanAttributes } from '@shared/monitoring/src/tracing';
import type { JobQueueService } from '@shared/job-queue/src/services/jobQueue.service';
import type { JobQueueClient } from '../clients/jobQueue.client';

const SCORE_SYSTEM_PROMPT = `You assess the investment risk of an RWA project from its summary. Return JSON only:
{
  "score": <integer 1-100, where 1 is the lowest risk>,
  "pros": ["<concrete point in favour>"],
  "cons": ["<concrete point against>"]
}
Give 3 to 7 pros and 3 to 7 cons, each a short factual sentence grounded in the summary. Do not invent facts that are absent from the summary.`;

type FileMeta = {
  id: string;
  name: string;
  mimeType: string;
  url: string;
};

export class EvaluationService {
  constructor(
    private readonly evaluationRepository: EvaluationRepository,
    private readonly jobQueueService: JobQueueService,
    private readonly jobQueueClient: JobQueueClient,
    private readonly openRouterClient: OpenRouterClient,
    private readonly rwaClient: RwaClient,
    private readonly documentsClient: DocumentsClient,
    private readonly galleryClient: GalleryClient,
    private readonly reactionsClient: ReactionsClient,
    private readonly questionsClient: QuestionsClient,
    private readonly portfolioClient: PortfolioClient,
    private readonly outboxPublisher: OutboxPublisherService<RabbitMQClient>,
    private readonly openRouterModel: string,
    private readonly maxFilesPerRequest: number,
    private readonly cooldownSeconds: number,
    private readonly useBase64Files: boolean = true,
  ) {
    mongoose.set('transactionAsyncLocalStorage', true);
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ entityType: a[0].entityType, entityId: a[0].entityId }),
  })
  async request(params: { entityType: 'pool' | 'business'; entityId: string }) {
    setSpanAttributes({ entityId: params.entityId, entityType: params.entityType });

    const availability = await this.getAvailability(params);

    if (!availability.available) {
      throw new AppError({
        message: `Evaluation is available in ${availability.cooldownLeft} seconds`,
        statusCode: 429,
        code: 'EVALUATION_COOLDOWN',
      });
    }

    const evaluationId = new Types.ObjectId().toString();

    await this.jobQueueService.start(
      this.jobQueueClient.getEvaluationQueue(),
      `evaluation-${params.entityType}-${params.entityId}`,
      { ...params, evaluationId },
    );

    return { evaluationId };
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ entityType: a[0].entityType, entityId: a[0].entityId }),
  })
  async getAvailability(params: { entityType: 'pool' | 'business'; entityId: string }) {
    setSpanAttributes({ entityId: params.entityId, entityType: params.entityType });

    if (params.entityType === 'pool') {
      const pool = await this.fetchPool({ poolId: params.entityId });

      if (!pool.poolAddress) {
        throw new AppError({
          message: 'Pool is not deployed yet',
          statusCode: 409,
          code: 'NOT_DEPLOYED',
        });
      }
    } else {
      const business = await this.fetchBusiness({ businessId: params.entityId });

      if (!business.tokenAddress) {
        throw new AppError({
          message: 'Business is not deployed yet',
          statusCode: 409,
          code: 'NOT_DEPLOYED',
        });
      }
    }

    const [lastEvaluation] = await this.evaluationRepository.findAll({ parentId: params.entityId }, { createdAt: 'desc' }, 1);
    const cooldownLeft = lastEvaluation
      ? lastEvaluation.createdAt + this.cooldownSeconds - Math.floor(Date.now() / 1000)
      : 0;

    return { available: cooldownLeft <= 0, cooldownLeft: Math.max(cooldownLeft, 0) };
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ entityType: a[0].entityType, entityId: a[0].entityId }),
  })
  async collectContext(params: { entityType: 'pool' | 'business'; entityId: string }) {
    setSpanAttributes({ entityId: params.entityId, entityType: params.entityType });

    const { grandParentId, ownerId, ownerType, blocks } =
      params.entityType === 'pool'
        ? await this.poolContext(params.entityId)
        : await this.businessContext(params.entityId);
    const context = blocks.map((block) => block.text).join('\n\n');
    const files = blocks.flatMap((block) => block.files ?? []);

    return { context, files, ownerId, ownerType, grandParentId };
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ files: a[0].files.length }),
  })
  async selectFiles(params: { context: string; files: FileMeta[] }) {
    const documents = params.files.filter((file) => !file.mimeType.startsWith('image/'));
    const images = params.files.filter((file) => file.mimeType.startsWith('image/'));

    if (params.files.length === 0) {
      return { selectedFiles: [] };
    }

    const hasDocuments = documents.length > 0;
    const hasImages = images.length > 0;
    const fileTypes = hasDocuments && hasImages ? 'documents and images' : hasDocuments ? 'documents' : 'images';

    const systemMessage = `You are a risk assessment expert. Analyze the following summary and decide which ${fileTypes} you need to study for a detailed risk evaluation.

${params.context}

Available documents:
${documents.map((d) => `- id=${d.id}, name=${d.name}, mimeType=${d.mimeType}`).join('\n')}

Available images:
${images.map((i) => `- id=${i.id}, name=${i.name}`).join('\n')}

Return JSON with the IDs of ${fileTypes} you want to examine:
{
${hasDocuments ? `  "requestedDocuments": ["docId1", "docId3"],\n` : ''}${hasImages ? `  "requestedImages": ["imgId2"]\n` : ''}}
If you don't need any ${fileTypes}, return empty arrays.`;

    const completion = await this.openRouterClient.chatCompletion({
      model: this.openRouterModel,
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: `Which ${fileTypes} do you need for risk evaluation? Return JSON only.` },
      ],
    });

    const parsed = this.parseLLMJsonResponse(completion.choices[0]?.message?.content ?? '');
    const requestedDocIds: string[] = parsed.requestedDocuments ?? [];
    const requestedImgIds: string[] = parsed.requestedImages ?? [];

    for (const docId of requestedDocIds) {
      if (!documents.find((d) => d.id === docId)) {
        throw new AppError({
          message: `LLM requested document ${docId} but it was not found`,
          statusCode: 400,
          code: 'NOT_FOUND',
        });
      }
    }

    for (const imgId of requestedImgIds) {
      if (!images.find((i) => i.id === imgId)) {
        throw new AppError({
          message: `LLM requested image ${imgId} but it was not found`,
          statusCode: 400,
          code: 'NOT_FOUND',
        });
      }
    }

    return {
      selectedFiles: params.files.filter((f) => requestedDocIds.includes(f.id) || requestedImgIds.includes(f.id)),
    };
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ files: a[0].selectedFiles.length }),
  })
  async summarize(params: { context: string; selectedFiles: FileMeta[] }) {
    if (params.selectedFiles.length > this.maxFilesPerRequest) {
      throw new AppError({
        message: `Too many files for OpenRouter request: ${params.selectedFiles.length}. Maximum allowed: ${this.maxFilesPerRequest}`,
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    }

    const completion = await this.openRouterClient.chatCompletion({
      model: this.openRouterModel,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: params.context }, ...(await this.fileParts(params.selectedFiles))],
        },
      ],
    });

    const summary = (completion.choices[0]?.message?.content ?? '').trim();

    if (!summary) {
      throw new AppError({
        message: 'LLM returned an empty summary',
        statusCode: 502,
        code: 'AI_ERROR',
      });
    }

    return { summary };
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator()
  async score(params: { summary: string }) {
    const completion = await this.openRouterClient.chatCompletion({
      model: this.openRouterModel,
      messages: [
        { role: 'system', content: SCORE_SYSTEM_PROMPT },
        { role: 'user', content: params.summary },
      ],
    });

    const parsed = this.parseLLMJsonResponse(completion.choices[0]?.message?.content ?? '');
    const riskScore = Number(parsed.score);

    if (!Number.isInteger(riskScore) || riskScore < 1 || riskScore > 100) {
      throw new AppError({
        message: `LLM returned invalid score: ${parsed.score}. Must be integer 1-100.`,
        statusCode: 502,
        code: 'AI_ERROR',
      });
    }

    const toItems = (value: unknown) =>
      Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
        : [];

    return { risk: { score: riskScore, pros: toItems(parsed.pros), cons: toItems(parsed.cons) } };
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ evaluationId: a[0].evaluationId, entityType: a[0].entityType, entityId: a[0].entityId }),
  })
  async save(params: {
    evaluationId: string;
    entityType: 'pool' | 'business';
    entityId: string;
    ownerId: string;
    ownerType: string;
    grandParentId: string;
    summary: string;
    selectedFiles: FileMeta[];
    risk: { score: number; pros: string[]; cons: string[] };
  }) {
    setSpanAttributes({ evaluationId: params.evaluationId, entityId: params.entityId, entityType: params.entityType });

    const [existing] = await this.evaluationRepository.findAll({ _id: params.evaluationId }, undefined, 1);

    if (existing) {
      return { evaluationId: params.evaluationId };
    }

    const sources = params.selectedFiles.map((file) => ({
      type: file.mimeType.startsWith('image/') ? 'image' : 'document',
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
    }));

    const routingKey = params.entityType === 'pool' ? 'poolResult' : 'businessResult';

    await mongoose.connection.transaction(async () => {
      await this.evaluationRepository.create({
        _id: new Types.ObjectId(params.evaluationId),
        entityType: params.entityType,
        parentId: params.entityId,
        grandParentId: params.grandParentId,
        ownerId: params.ownerId,
        ownerType: params.ownerType,
        summary: params.summary,
        sources,
        risk: params.risk,
        modelUsed: this.openRouterModel,
      });

      await this.outboxPublisher.publish(
        this.outboxPublisher.rabbitClient.getEvaluationExchange(),
        routingKey,
        {
          evaluationId: params.evaluationId,
          entityType: params.entityType,
          entityId: params.entityId,
          riskScore: params.risk.score,
        },
        params.evaluationId,
      );
    });

    return { evaluationId: params.evaluationId };
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ evaluationId: a[0].id }),
  })
  async getEvaluation(params: { id: string }) {
    setSpanAttributes({ evaluationId: params.id });
    const evaluation = await this.evaluationRepository.findById(params.id);
    return this.mapEvaluation(evaluation);
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ filterKeys: Object.keys(a[0].filter).join(',') }),
  })
  async getEvaluations(params: {
    filter: Record<string, any>;
    sort?: { [key: string]: SortOrder };
    limit?: number;
    offset?: number;
  }) {
    setSpanAttributes({ filterKeys: Object.keys(params.filter).join(',') });

    const sort = params.sort
      ? Object.fromEntries(
          Object.entries(params.sort).map(([key, order]) => [key === 'riskScore' ? 'risk.score' : key, order]),
        )
      : undefined;

    const evaluations = await this.evaluationRepository.findAll(
      params.filter,
      sort,
      params.limit,
      params.offset,
    );
    return evaluations.map((e) => this.mapEvaluation(e));
  }

  private async poolContext(poolId: string) {
    const pool = await this.fetchPool({ poolId });

    if (!pool.poolAddress) {
      throw new AppError({
        message: 'Pool is not deployed yet',
        statusCode: 409,
        code: 'NOT_DEPLOYED',
      });
    }

    const business = await this.fetchBusiness({ businessId: pool.businessId });

    const blocks = (
      await Promise.all([
        this.poolModule(pool),
        this.businessModule(business),
        this.siblingPoolsModule({ businessId: pool.businessId, excludeId: poolId }),
        this.documentsModule({ parentId: poolId }),
        this.galleryModule({ parentId: poolId }),
        this.reactionsModule({ parentId: poolId, parentType: 'pool' }),
        this.questionsModule({ parentId: poolId }),
        this.portfolioModule({ poolAddress: pool.poolAddress }),
      ])
    ).filter(Boolean) as { text: string; files?: FileMeta[] }[];

    return {
      grandParentId: pool.businessId,
      ownerId: pool.ownerId,
      ownerType: pool.ownerType,
      blocks,
    };
  }

  private async businessContext(businessId: string) {
    const business = await this.fetchBusiness({ businessId });

    if (!business.tokenAddress) {
      throw new AppError({
        message: 'Business is not deployed yet',
        statusCode: 409,
        code: 'NOT_DEPLOYED',
      });
    }

    const blocks = (
      await Promise.all([
        this.businessModule(business),
        this.poolsModule({ businessId }),
        this.documentsModule({ parentId: businessId }),
        this.galleryModule({ parentId: businessId }),
        this.reactionsModule({ parentId: businessId, parentType: 'business' }),
        this.questionsModule({ parentId: businessId }),
      ])
    ).filter(Boolean) as { text: string; files?: FileMeta[] }[];

    return {
      grandParentId: businessId,
      ownerId: business.ownerId,
      ownerType: business.ownerType,
      blocks,
    };
  }

  private async fileParts(files: FileMeta[]) {
    const parts: Array<FileContentPart | ImageContentPart> = [];

    for (const file of files) {
      if (file.mimeType.startsWith('image/')) {
        parts.push({
          type: 'image_url',
          imageUrl: { url: this.useBase64Files ? await this.urlToBase64(file.url) : file.url },
        });
      } else {
        parts.push({
          type: 'file',
          file: {
            filename: file.name,
            fileData: this.useBase64Files ? await this.urlToBase64(file.url) : file.url,
          },
        });
      }
    }

    return parts;
  }

  private async poolModule(pool: any) {
    return {
      text: `Entity type: pool
Pool name: ${pool.name}
Pool description: ${pool.description ?? 'N/A'}
Pool tags: ${pool.tags?.join(', ') ?? 'N/A'}
Entry fee: ${pool.entryFeePercent ?? 'N/A'}
Exit fee: ${pool.exitFeePercent ?? 'N/A'}
Expected HOLD amount: ${pool.expectedHoldAmount ?? 'N/A'}
Expected RWA amount: ${pool.expectedRwaAmount ?? 'N/A'}
Reward percent: ${pool.rewardPercent ?? 'N/A'}`,
    };
  }

  private async businessModule(business: any) {
    return {
      text: `Business name: ${business.name}
Business type: ${business.businessType ?? 'N/A'}
Country: ${business.country ?? 'N/A'}
Tags: ${business.tags?.join(', ') ?? 'N/A'}`,
    };
  }

  private async siblingPoolsModule(params: { businessId: string; excludeId: string }) {
    const response = await this.rwaClient.getPools.post({ filter: { businessId: params.businessId } });
    if (response.error || !response.data) {
      throw new AppError({
        message: 'Failed to fetch pools from rwa service',
        statusCode: 502,
        code: 'UPSTREAM_ERROR',
      });
    }
    const siblings = response.data
      .filter((p: any) => p.id !== params.excludeId)
      .map((p: any) => `- ${p.name}: riskScore=${p.riskScore ?? 'not yet evaluated'}, deployed=${!!p.poolAddress}`);

    return {
      text: siblings.length > 0 ? `Sibling pools:\n${siblings.join('\n')}` : 'Sibling pools: none',
    };
  }

  private async poolsModule(params: { businessId: string }) {
    const response = await this.rwaClient.getPools.post({ filter: { businessId: params.businessId } });
    if (response.error || !response.data) {
      throw new AppError({
        message: 'Failed to fetch pools from rwa service',
        statusCode: 502,
        code: 'UPSTREAM_ERROR',
      });
    }
    const pools = response.data.map(
      (p: any) => `- ${p.name}: riskScore=${p.riskScore ?? 'not yet evaluated'}, deployed=${!!p.poolAddress}`,
    );

    return {
      text: pools.length > 0 ? `Pools of this business:\n${pools.join('\n')}` : 'Pools: none',
    };
  }

  private async documentsModule(params: { parentId: string }) {
    const response = await this.documentsClient.getDocuments.post({ filter: { parentId: params.parentId } });
    if (response.error || !response.data) {
      throw new AppError({
        message: 'Failed to fetch documents from documents service',
        statusCode: 502,
        code: 'UPSTREAM_ERROR',
      });
    }
    const files = response.data.map((d: any) => ({
      id: d.id,
      name: d.name,
      mimeType: d.mimeType,
      url: d.url,
    }));

    return {
      text:
        files.length > 0
          ? `Documents:\n${files.map((f) => `- id=${f.id}, name=${f.name}, mimeType=${f.mimeType}`).join('\n')}`
          : 'Documents: none exist',
      files,
    };
  }

  private async galleryModule(params: { parentId: string }) {
    const response = await this.galleryClient.getImages.post({ filter: { parentId: params.parentId } });
    if (response.error || !response.data) {
      throw new AppError({
        message: 'Failed to fetch images from gallery service',
        statusCode: 502,
        code: 'UPSTREAM_ERROR',
      });
    }
    const files = response.data.map((i: any) => ({
      id: i.id,
      name: i.name,
      mimeType: 'image/jpeg',
      url: i.url,
    }));

    return {
      text:
        files.length > 0
          ? `Images:\n${files.map((f) => `- id=${f.id}, name=${f.name}`).join('\n')}`
          : 'Images: none exist',
      files,
    };
  }

  private async reactionsModule(params: { parentId: string; parentType: string }) {
    const response = await this.reactionsClient.getEntityReactions.post({
      parentId: params.parentId,
      parentType: params.parentType,
    });
    if (response.error || !response.data) {
      throw new AppError({
        message: 'Failed to fetch reactions from reactions service',
        statusCode: 502,
        code: 'UPSTREAM_ERROR',
      });
    }
    const entries = Object.entries(response.data.reactions ?? {});
    return {
      text: entries.length > 0 ? `Reactions: ${entries.map(([t, c]) => `${t}: ${c}`).join(', ')}` : 'Reactions: none',
    };
  }

  private async questionsModule(params: { parentId: string }) {
    const response = await this.questionsClient.getQuestions.post({ filter: { parentId: params.parentId } });
    if (response.error || !response.data) {
      throw new AppError({
        message: 'Failed to fetch questions from questions service',
        statusCode: 502,
        code: 'UPSTREAM_ERROR',
      });
    }
    const total = response.data.length;
    const answered = response.data.filter((q: any) => q.answered).length;
    return {
      text: `Q&A: ${total} questions, ${answered} answered`,
    };
  }

  private async portfolioModule(params: { poolAddress: string }) {
    const response = await this.portfolioClient.getBalances.post({ filter: { poolAddress: params.poolAddress } });
    if (response.error || !response.data) {
      throw new AppError({
        message: 'Failed to fetch portfolio from portfolio service',
        statusCode: 502,
        code: 'UPSTREAM_ERROR',
      });
    }
    return {
      text: response.data.length > 0 ? `Portfolio: ${response.data.length} investors` : 'Portfolio: none',
    };
  }

  @TraceDecorator()
  @LogDecorator({ args: (a) => ({ poolId: a[0].poolId }) })
  private async fetchPool(params: { poolId: string }) {
    const response = await this.rwaClient.getPool.post({ id: params.poolId });
    if (response.error || !response.data) {
      throw new AppError({
        message: 'Failed to fetch pool from rwa service',
        statusCode: 502,
        code: 'UPSTREAM_ERROR',
      });
    }
    return response.data;
  }

  @TraceDecorator()
  @LogDecorator({ args: (a) => ({ businessId: a[0].businessId }) })
  private async fetchBusiness(params: { businessId: string }) {
    const response = await this.rwaClient.getBusiness.post({ id: params.businessId });
    if (response.error || !response.data) {
      throw new AppError({
        message: 'Failed to fetch business from rwa service',
        statusCode: 502,
        code: 'UPSTREAM_ERROR',
      });
    }
    return response.data;
  }

  private async urlToBase64(url: string) {
    const internalUrl = url.replace('https://rwa.local', 'https://nginx');
    const response = await fetch(internalUrl, { tls: { rejectUnauthorized: false } });
    if (!response.ok) {
      throw new AppError({
        message: `Failed to fetch file for base64 conversion: ${response.status} ${response.statusText}`,
        statusCode: 502,
        code: 'UPSTREAM_ERROR',
      });
    }
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
    return `data:${contentType};base64,${base64}`;
  }

  private parseLLMJsonResponse(response: string): any {
    let cleaned = response.trim();
    const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      cleaned = codeBlockMatch[1].trim();
    }
    try {
      return JSON.parse(cleaned);
    } catch (error) {
      throw new AppError({
        message: 'Failed to parse LLM response as JSON',
        statusCode: 502,
        code: 'AI_ERROR',
        cause: error,
      });
    }
  }

  private mapEvaluation(evaluation: any) {
    return {
      id: evaluation._id.toString(),
      entityType: evaluation.entityType,
      parentId: evaluation.parentId,
      grandParentId: evaluation.grandParentId,
      ownerId: evaluation.ownerId,
      ownerType: evaluation.ownerType,
      risk: {
        score: evaluation.risk?.score ?? undefined,
        pros: evaluation.risk?.pros ?? [],
        cons: evaluation.risk?.cons ?? [],
      },
      summary: evaluation.summary,
      sources: evaluation.sources ?? [],
      modelUsed: evaluation.modelUsed ?? undefined,
      createdAt: evaluation.createdAt,
      updatedAt: evaluation.updatedAt,
    };
  }
}
