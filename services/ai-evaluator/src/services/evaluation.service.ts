import mongoose from 'mongoose';
import type { SortOrder } from 'mongoose';
import { AppError } from '@shared/errors/app-errors';
import { OpenRouterClient } from '@shared/openrouter/client';
import type { FileContentPart, ImageContentPart } from '@shared/openrouter/types';
import type { OutboxPublisherService } from '@shared/outbox-publisher';
import type { RabbitMQClient } from '../clients/rabbitmq.client';
import type { EvaluationRepository } from '../repositories/evaluation.repository';
import type { EvaluationLockRepository } from '../repositories/evaluationLock.repository';
import type { IEvaluationEntity } from '../models/entity/evaluation.entity';
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

const EVALUATION_COOLDOWN_SECONDS = 24 * 60 * 60;

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

type ContextData = {
  text: string;
  files: FileMeta[];
};

type Risk = {
  score: number;
  pros: string[];
  cons: string[];
};

export class EvaluationService {
  constructor(
    private readonly evaluationRepository: EvaluationRepository,
    private readonly evaluationLockRepository: EvaluationLockRepository,
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
    await this.assertDeployed(params);

    const evaluationId = await mongoose.connection.transaction(async () => {
      await this.evaluationLockRepository.acquire(
        params.entityType,
        params.entityId,
        EVALUATION_COOLDOWN_SECONDS,
      );

      const evaluation = await this.evaluationRepository.create({
        entityType: params.entityType,
        parentId: params.entityId,
      });

      const id = evaluation._id.toString();

      await this.outboxPublisher.publish(
        this.outboxPublisher.rabbitClient.getEvaluationRequestsExchange(),
        'evaluate',
        {
          evaluationId: id,
          entityType: params.entityType,
          entityId: params.entityId,
        },
        id,
      );

      return id;
    });

    return { evaluationId };
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ evaluationId: a[0]._id.toString(), entityType: a[0].entityType, entityId: a[0].parentId }),
  })
  async collectContext(evaluation: IEvaluationEntity): Promise<ContextData> {
    setSpanAttributes({ entityId: evaluation.parentId, entityType: evaluation.entityType });

    if (evaluation.context) {
      return {
        text: evaluation.context.text,
        files: (evaluation.context.files ?? []).map((file) => ({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          url: file.url,
        })),
      };
    }

    const { grandParentId, ownerId, ownerType, blocks } =
      evaluation.entityType === 'pool'
        ? await this.poolContext(evaluation.parentId)
        : await this.businessContext(evaluation.parentId);
    const text = blocks.map((block) => block.text).join('\n\n');
    const files = blocks.flatMap((block) => block.files ?? []);

    const updated = await this.evaluationRepository.fillContext(evaluation._id.toString(), {
      text,
      files,
      ownerId,
      ownerType,
      grandParentId,
    });

    if (!updated) {
      throw new AppError({
        message: 'Evaluation context step conflict',
        statusCode: 409,
        code: 'EVALUATION_STEP_CONFLICT',
      });
    }

    return { text, files };
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ evaluationId: a[0]._id.toString(), files: a[1].files.length }),
  })
  async selectFiles(evaluation: IEvaluationEntity, context: ContextData): Promise<FileMeta[]> {
    if (evaluation.selection) {
      return (evaluation.selection.files ?? []).map((file) => ({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        url: file.url,
      }));
    }

    const documents = context.files.filter((file) => !file.mimeType.startsWith('image/'));
    const images = context.files.filter((file) => file.mimeType.startsWith('image/'));

    if (context.files.length === 0) {
      const updated = await this.evaluationRepository.fillSelection(evaluation._id.toString(), []);

      if (!updated) {
        throw new AppError({
          message: 'Evaluation selection step conflict',
          statusCode: 409,
          code: 'EVALUATION_STEP_CONFLICT',
        });
      }

      return [];
    }

    const hasDocuments = documents.length > 0;
    const hasImages = images.length > 0;
    const fileTypes = hasDocuments && hasImages ? 'documents and images' : hasDocuments ? 'documents' : 'images';

    const systemMessage = `You are a risk assessment expert. Analyze the following summary and decide which ${fileTypes} you need to study for a detailed risk evaluation.

${context.text}

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
    const requestedDocIds: string[] = Array.isArray(parsed.requestedDocuments) ? parsed.requestedDocuments : [];
    const requestedImgIds: string[] = Array.isArray(parsed.requestedImages) ? parsed.requestedImages : [];

    const selectedFiles = context.files.filter((f) => requestedDocIds.includes(f.id) || requestedImgIds.includes(f.id));

    const updated = await this.evaluationRepository.fillSelection(evaluation._id.toString(), selectedFiles);

    if (!updated) {
      throw new AppError({
        message: 'Evaluation selection step conflict',
        statusCode: 409,
        code: 'EVALUATION_STEP_CONFLICT',
      });
    }

    return selectedFiles;
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ evaluationId: a[0]._id.toString(), files: a[2].length }),
  })
  async summarize(evaluation: IEvaluationEntity, context: ContextData, selectedFiles: FileMeta[]): Promise<string> {
    if (evaluation.summary) {
      return evaluation.summary;
    }

    if (selectedFiles.length > this.maxFilesPerRequest) {
      throw new AppError({
        message: `Too many files for OpenRouter request: ${selectedFiles.length}. Maximum allowed: ${this.maxFilesPerRequest}`,
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    }

    const completion = await this.openRouterClient.chatCompletion({
      model: this.openRouterModel,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: context.text }, ...(await this.fileParts(selectedFiles))],
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

    const updated = await this.evaluationRepository.fillSummary(evaluation._id.toString(), summary);

    if (!updated) {
      throw new AppError({
        message: 'Evaluation summary step conflict',
        statusCode: 409,
        code: 'EVALUATION_STEP_CONFLICT',
      });
    }

    return summary;
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ evaluationId: a[0]._id.toString() }),
  })
  async score(evaluation: IEvaluationEntity, summary: string): Promise<Risk> {
    if (evaluation.risk && evaluation.risk.score !== null && evaluation.risk.score !== undefined) {
      return { score: evaluation.risk.score, pros: evaluation.risk.pros, cons: evaluation.risk.cons };
    }

    const completion = await this.openRouterClient.chatCompletion({
      model: this.openRouterModel,
      messages: [
        { role: 'system', content: SCORE_SYSTEM_PROMPT },
        { role: 'user', content: summary },
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

    const risk = { score: riskScore, pros: toItems(parsed.pros), cons: toItems(parsed.cons) };

    const updated = await this.evaluationRepository.fillRisk(evaluation._id.toString(), risk);

    if (!updated) {
      throw new AppError({
        message: 'Evaluation risk step conflict',
        statusCode: 409,
        code: 'EVALUATION_STEP_CONFLICT',
      });
    }

    return risk;
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ evaluationId: a[0].evaluationId }),
  })
  async processEvaluation(params: { evaluationId: string }, commitInbox: () => Promise<void>) {
    setSpanAttributes({ evaluationId: params.evaluationId });

    const evaluation = await this.evaluationRepository.findById(params.evaluationId);

    if (evaluation.completed) {
      await commitInbox();
      return;
    }

    const context = await this.collectContext(evaluation);
    const selectedFiles = await this.selectFiles(evaluation, context);
    const summary = await this.summarize(evaluation, context, selectedFiles);
    const risk = await this.score(evaluation, summary);

    await this.finalize(evaluation, selectedFiles, risk, commitInbox);
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ evaluationId: a[0]._id.toString() }),
  })
  async finalize(
    evaluation: IEvaluationEntity,
    selectedFiles: FileMeta[],
    risk: Risk,
    commitInbox: () => Promise<void>,
  ) {
    const sources = selectedFiles.map((file) => ({
      type: file.mimeType.startsWith('image/') ? 'image' : 'document',
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
    }));

    await mongoose.connection.transaction(async () => {
      const finalized = await this.evaluationRepository.finalize(evaluation._id.toString(), {
        sources,
        modelUsed: this.openRouterModel,
      });

      if (!finalized) {
        throw new AppError({
          message: 'Evaluation already finalized',
          statusCode: 409,
          code: 'EVALUATION_ALREADY_FINALIZED',
        });
      }

      await this.outboxPublisher.publish(
        this.outboxPublisher.rabbitClient.getEvaluationResultsExchange(),
        evaluation.entityType === 'pool' ? 'poolResult' : 'businessResult',
        {
          evaluationId: evaluation._id.toString(),
          entityType: evaluation.entityType,
          entityId: evaluation.parentId,
          riskScore: risk.score,
        },
        evaluation._id.toString(),
      );

      await commitInbox();
    });
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

    const evaluations = await this.evaluationRepository.findAll(params.filter, sort, params.limit, params.offset);
    return evaluations.map((e) => this.mapEvaluation(e));
  }

  private async assertDeployed(params: { entityType: 'pool' | 'business'; entityId: string }) {
    if (params.entityType === 'pool') {
      const pool = await this.fetchPool({ poolId: params.entityId });

      if (!pool.poolAddress) {
        throw new AppError({
          message: 'Pool is not deployed yet',
          statusCode: 409,
          code: 'NOT_DEPLOYED',
        });
      }

      return;
    }

    const business = await this.fetchBusiness({ businessId: params.entityId });

    if (!business.tokenAddress) {
      throw new AppError({
        message: 'Business is not deployed yet',
        statusCode: 409,
        code: 'NOT_DEPLOYED',
      });
    }
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
      grandParentId: evaluation.grandParentId ?? undefined,
      ownerId: evaluation.ownerId ?? undefined,
      ownerType: evaluation.ownerType ?? undefined,
      risk: {
        score: evaluation.risk?.score ?? undefined,
        pros: evaluation.risk?.pros ?? [],
        cons: evaluation.risk?.cons ?? [],
      },
      summary: evaluation.summary ?? undefined,
      sources: evaluation.sources ?? [],
      modelUsed: evaluation.modelUsed ?? undefined,
      completed: evaluation.completed,
      completedAt: evaluation.completed ? evaluation.updatedAt : undefined,
      createdAt: evaluation.createdAt,
      updatedAt: evaluation.updatedAt,
    };
  }
}
