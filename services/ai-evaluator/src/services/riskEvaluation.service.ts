import mongoose, { Types } from 'mongoose';
import type { EvaluationJob } from '../models/entity/evaluationJob.entity';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { AppError } from '@shared/errors/app-errors';
import { OpenRouterClient } from '@shared/openrouter/client';
import type { ChatMessage, TextContentPart, FileContentPart, ImageContentPart } from '@shared/openrouter/types';
import type { EvaluationRepository } from '../repositories/evaluation.repository';
import type { EvaluationJobRepository } from '../repositories/evaluationJob.repository';
import type {
  RwaClient,
  DocumentsClient,
  GalleryClient,
  ReactionsClient,
  QuestionsClient,
  PortfolioClient,
} from '../clients/eden.clients';
import type { OutboxPublisherService } from '@shared/outbox-publisher';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import { MetricsDecorator } from '@shared/monitoring/src/metricsDecorator';
import { LogDecorator } from '@shared/monitoring/src/logDecorator';
import { setSpanAttributes } from '@shared/monitoring/src/tracing';
import type { SortOrder } from 'mongoose';

const EVALUATION_RESULT_ROUTING_KEY = {
  pool: 'poolResult',
  business: 'businessResult',
} as const;

type FileMeta = {
  id: string;
  name: string;
  mimeType: string;
  url: string;
};

const EVALUATION_JOB_MAX_ATTEMPTS = 3;

export class RiskEvaluationService {
  constructor(
    private readonly evaluationRepository: EvaluationRepository,
    private readonly evaluationJobRepository: EvaluationJobRepository,
    private readonly openRouterClient: OpenRouterClient,
    private readonly rwaClient: RwaClient,
    private readonly documentsClient: DocumentsClient,
    private readonly galleryClient: GalleryClient,
    private readonly reactionsClient: ReactionsClient,
    private readonly questionsClient: QuestionsClient,
    private readonly portfolioClient: PortfolioClient,
    private readonly outboxPublisher: OutboxPublisherService,
    private readonly evaluationExchange: string,
    private readonly openRouterModel: string,
    private readonly maxFilesPerRequest: number,
    private readonly useBase64Files: boolean = true,
  ) {
    mongoose.set('transactionAsyncLocalStorage', true);
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ poolId: a[0].poolId, ownerId: a[0].ownerId, ownerType: a[0].ownerType }),
  })
  async evaluatePool(params: { poolId: string; ownerId: string; ownerType: string }) {
    setSpanAttributes({ entityId: params.poolId, entityType: 'pool' });

    const pool = await this.fetchPool({ poolId: params.poolId });
    const business = await this.fetchBusiness({ businessId: pool.businessId });

    const result = await this.evaluate([
      this.poolModule(pool),
      this.businessModule(business),
      this.siblingPoolsModule({ businessId: pool.businessId, excludeId: params.poolId }),
      this.documentsModule({ parentId: params.poolId }),
      this.galleryModule({ parentId: params.poolId }),
      this.reactionsModule({ parentId: params.poolId, parentType: 'pool' }),
      this.questionsModule({ parentId: params.poolId }),
      pool.poolAddress ? this.portfolioModule({ poolAddress: pool.poolAddress }) : null,
    ]);

    await mongoose.connection.transaction(async () => {
      const evaluation = await this.evaluationRepository.create({
        entityType: 'pool',
        parentId: params.poolId,
        grandParentId: pool.businessId,
        ownerId: params.ownerId,
        ownerType: params.ownerType,
        ...this.buildEvaluationResult(result),
      });

      const evaluationId = evaluation._id.toString();

      await this.outboxPublisher.publish(
        this.evaluationExchange,
        EVALUATION_RESULT_ROUTING_KEY.pool,
        { evaluationId, entityType: 'pool', entityId: params.poolId, riskScore: result.riskScore },
        evaluationId,
      );
    });
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ businessId: a[0].businessId, ownerId: a[0].ownerId, ownerType: a[0].ownerType }),
  })
  async evaluateBusiness(params: { businessId: string; ownerId: string; ownerType: string }) {
    setSpanAttributes({ entityId: params.businessId, entityType: 'business' });

    const business = await this.fetchBusiness({ businessId: params.businessId });

    const result = await this.evaluate([
      this.businessModule(business),
      this.poolsModule({ businessId: params.businessId }),
      this.documentsModule({ parentId: params.businessId }),
      this.galleryModule({ parentId: params.businessId }),
      this.reactionsModule({ parentId: params.businessId, parentType: 'business' }),
      this.questionsModule({ parentId: params.businessId }),
    ]);

    await mongoose.connection.transaction(async () => {
      const evaluation = await this.evaluationRepository.create({
        entityType: 'business',
        parentId: params.businessId,
        grandParentId: params.businessId,
        ownerId: params.ownerId,
        ownerType: params.ownerType,
        ...this.buildEvaluationResult(result),
      });

      const evaluationId = evaluation._id.toString();

      await this.outboxPublisher.publish(
        this.evaluationExchange,
        EVALUATION_RESULT_ROUTING_KEY.business,
        { evaluationId, entityType: 'business', entityId: params.businessId, riskScore: result.riskScore },
        evaluationId,
      );
    });
  }

  async createPoolEvaluation(params: { poolId: string; ownerId: string; ownerType: string }) {
    const job = await this.evaluationJobRepository.create({ entityType: 'pool', entityId: params.poolId, params });

    return { jobId: job._id.toString() };
  }

  async createBusinessEvaluation(params: { businessId: string; ownerId: string; ownerType: string }) {
    const job = await this.evaluationJobRepository.create({
      entityType: 'business',
      entityId: params.businessId,
      params,
    });

    return { jobId: job._id.toString() };
  }

  @TraceDecorator()
  async processEvaluationJobs(concurrency: number): Promise<void> {
    await this.evaluationJobRepository.releaseProcessing();

    const inFlight = new Set<Promise<void>>();

    while (true) {
      if (inFlight.size >= concurrency) await Promise.race(inFlight);

      const job = await this.evaluationJobRepository.claimNext();
      if (!job) break;

      const processing = this.processEvaluationJob(job);
      inFlight.add(processing);
      processing.finally(() => inFlight.delete(processing));
    }

    await Promise.all(inFlight);
  }

  private async processEvaluationJob(job: EvaluationJob & { _id: Types.ObjectId },): Promise<void> {
    const params = job.params as { poolId?: string; businessId?: string; ownerId: string; ownerType: string };

    try {
      if (job.entityType === 'pool') {
        await this.evaluatePool(params as { poolId: string; ownerId: string; ownerType: string });
      } else {
        await this.evaluateBusiness(params as { businessId: string; ownerId: string; ownerType: string });
      }

      await this.evaluationJobRepository.markDone(job._id);
    } catch (error) {
      const failed = await this.evaluationJobRepository.markAttemptFailed(job._id, EVALUATION_JOB_MAX_ATTEMPTS).catch(() => null);

      logger.error(`Evaluation job "${job._id}" (${job.entityType} ${job.entityId}) failed:`, error);

      if (failed?.status === 'failed') {
        logger.error(`Evaluation job "${job._id}": attempts exhausted (${failed.attempts}); it is left alone`);
      }
    }
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
    const evaluations = await this.evaluationRepository.findAll(
      params.filter,
      params.sort,
      params.limit,
      params.offset,
    );
    return evaluations.map((e) => this.mapEvaluation(e));
  }

  private async evaluate(modules: (Promise<{ text: string; files?: FileMeta[] }> | null)[]) {
    const results = (await Promise.all(modules)).filter(Boolean);

    const summary = results.map((r) => r!.text).join('\n\n');
    const allFiles = results.flatMap((r) => r!.files ?? []);

    let selectedFiles = allFiles;
    let selectionResponse: string | undefined;

    if (allFiles.length > 0) {
      const selection = await this.selectFiles(summary, allFiles);
      selectionResponse = selection.llmResponse;
      selectedFiles = selection.selectedFiles;
    }

    const evaluation = await this.evaluateRisk(summary, selectedFiles);

    return {
      riskScore: evaluation.riskScore,
      reasoning: evaluation.reasoning,
      factors: evaluation.factors,
      llmResponse: evaluation.llmResponse,
      selectionResponse,
      selectedFiles,
    };
  }

  private async selectFiles(summary: string, files: FileMeta[]) {
    const documents = files.filter((f) => !f.mimeType.startsWith('image/'));
    const images = files.filter((f) => f.mimeType.startsWith('image/'));

    const hasDocuments = documents.length > 0;
    const hasImages = images.length > 0;
    const fileTypes = hasDocuments && hasImages ? 'documents and images' : hasDocuments ? 'documents' : 'images';

    const systemMessage = `You are a risk assessment expert. Analyze the following summary and decide which ${fileTypes} you need to study for a detailed risk evaluation.

${summary}

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

    const llmResponse = completion.choices[0]?.message?.content ?? '';
    const parsed = this.parseLLMJsonResponse(llmResponse);

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

    const selectedFiles = files.filter((f) => requestedDocIds.includes(f.id) || requestedImgIds.includes(f.id));

    return { llmResponse, selectedFiles };
  }

  private async evaluateRisk(summary: string, files: FileMeta[]) {
    const totalFiles = files.length;
    if (totalFiles > this.maxFilesPerRequest) {
      throw new AppError({
        message: `Too many files for OpenRouter request: ${totalFiles}. Maximum allowed: ${this.maxFilesPerRequest}`,
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    }

    const contentParts: Array<TextContentPart | FileContentPart | ImageContentPart> = [
      { type: 'text', text: summary },
      {
        type: 'text',
        text: `\n\nPlease evaluate the risk of this entity based on the summary above and the attached documents/images. Return JSON:
{
  "riskScore": <integer 1-100>,
  "reasoning": "<textual justification>",
  "factors": [{"name": "<factor name>", "impact": "<positive|negative|neutral>", "detail": "<explanation>"}]
}

riskScore must be an integer between 1 and 100. 0 is not allowed.`,
      },
    ];

    for (const file of files) {
      if (file.mimeType.startsWith('image/')) {
        contentParts.push({
          type: 'image_url',
          imageUrl: { url: this.useBase64Files ? await this.urlToBase64(file.url) : file.url },
        });
      } else {
        contentParts.push({
          type: 'file',
          file: {
            filename: file.name,
            fileData: this.useBase64Files ? await this.urlToBase64(file.url) : file.url,
          },
        });
      }
    }

    const messages: ChatMessage[] = [{ role: 'user', content: contentParts }];

    const completion = await this.openRouterClient.chatCompletion({
      model: this.openRouterModel,
      messages,
    });

    const llmResponse = completion.choices[0]?.message?.content ?? '';
    const parsed = this.parseLLMJsonResponse(llmResponse);

    const riskScore = Number(parsed.riskScore);
    if (!Number.isInteger(riskScore) || riskScore < 1 || riskScore > 100) {
      throw new AppError({
        message: `LLM returned invalid riskScore: ${parsed.riskScore}. Must be integer 1-100.`,
        statusCode: 502,
        code: 'AI_ERROR',
      });
    }

    return {
      riskScore,
      reasoning: String(parsed.reasoning ?? ''),
      factors: Array.isArray(parsed.factors) ? parsed.factors : [],
      llmResponse,
    };
  }

  private buildEvaluationResult(result: Awaited<ReturnType<typeof this.evaluate>>) {
    return {
      riskScore: result.riskScore,
      reasoning: result.reasoning,
      factors: result.factors,
      stage1Response: result.selectionResponse,
      stage2Response: result.llmResponse,
      evaluatedDocuments: result.selectedFiles
        .filter((file) => !file.mimeType.startsWith('image/'))
        .map((file) => ({ id: file.id, name: file.name, mimeType: file.mimeType })),
      evaluatedImages: result.selectedFiles
        .filter((file) => file.mimeType.startsWith('image/'))
        .map((file) => ({ id: file.id, name: file.name })),
      modelUsed: this.openRouterModel,
    };
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
      riskScore: evaluation.riskScore ?? undefined,
      reasoning: evaluation.reasoning ?? undefined,
      factors: evaluation.factors ?? [],
      stage1Response: evaluation.stage1Response ?? undefined,
      stage2Response: evaluation.stage2Response ?? undefined,
      evaluatedDocuments: evaluation.evaluatedDocuments ?? [],
      evaluatedImages: evaluation.evaluatedImages ?? [],
      modelUsed: evaluation.modelUsed ?? undefined,
      createdAt: evaluation.createdAt,
      updatedAt: evaluation.updatedAt,
    };
  }
}
