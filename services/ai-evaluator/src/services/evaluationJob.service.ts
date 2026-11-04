import mongoose, { Types } from 'mongoose';
import { AppError } from '@shared/errors/app-errors';
import type { RabbitMQClient } from '../clients/rabbitmq.client';
import type { OutboxPublisherService } from '@shared/outbox-publisher';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import { MetricsDecorator } from '@shared/monitoring/src/metricsDecorator';
import { LogDecorator } from '@shared/monitoring/src/logDecorator';
import { setSpanAttributes } from '@shared/monitoring/src/tracing';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { metrics } from '@shared/monitoring/src/metrics';
import type { EvaluationRepository } from '../repositories/evaluation.repository';
import type { EvaluationJobRepository } from '../repositories/evaluationJob.repository';
import type { RiskEvaluationService } from './riskEvaluation.service';

const EVALUATION_RESULT_ROUTING_KEY = {
  pool: 'poolResult',
  business: 'businessResult',
} as const;

const LOCK_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 30 * 1000;

type EvaluationRequest = {
  entityType: 'pool' | 'business';
  entityId: string;
  ownerId: string;
  ownerType: string;
};

type ClaimedJob = EvaluationRequest & {
  _id: unknown;
  evaluationId: unknown;
  attempts?: number;
};

export class EvaluationJobService {
  constructor(
    private readonly evaluationRepository: EvaluationRepository,
    private readonly evaluationJobRepository: EvaluationJobRepository,
    private readonly riskEvaluationService: RiskEvaluationService,
    private readonly outboxPublisher: OutboxPublisherService<RabbitMQClient>,
    private readonly cooldownSeconds: number,
  ) {
    mongoose.set('transactionAsyncLocalStorage', true);
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ entityType: a[0].entityType, entityId: a[0].entityId, ownerId: a[0].ownerId }),
  })
  async start(params: EvaluationRequest): Promise<string> {
    setSpanAttributes({ entityId: params.entityId, entityType: params.entityType });

    const [lastEvaluation] = await this.evaluationRepository.findAll(
      { parentId: params.entityId },
      { createdAt: 'desc' },
      1,
    );

    const cooldownLeft = lastEvaluation
      ? lastEvaluation.createdAt + this.cooldownSeconds - Math.floor(Date.now() / 1000)
      : 0;

    if (cooldownLeft > 0) {
      throw new AppError({
        message: `Evaluation is available in ${cooldownLeft} seconds`,
        statusCode: 429,
        code: 'EVALUATION_COOLDOWN',
      });
    }

    const evaluationId = new Types.ObjectId();

    await this.evaluationJobRepository.create({
      evaluationId,
      entityType: params.entityType,
      entityId: params.entityId,
      ownerId: params.ownerId,
      ownerType: params.ownerType,
      status: 'pending',
      attempts: 0,
    });

    return evaluationId.toString();
  }

  @TraceDecorator()
  @MetricsDecorator()
  async processNext(): Promise<boolean> {
    const job = await this.evaluationJobRepository.claimNext(LOCK_MS);

    if (!job) {
      return false;
    }

    await this.processJob(job as ClaimedJob);

    return true;
  }

  private async processJob(job: ClaimedJob): Promise<void> {
    const jobId = String(job._id);

    try {
      await this.evaluateJob(job);

      metrics.counter('evaluation_jobs_processed_total');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      logger.error(`Evaluation job ${jobId} failed: ${message}`);

      const statusCode = (error as { statusCode?: number }).statusCode;
      const permanent = typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500;

      if (permanent || (job.attempts ?? 0) >= MAX_ATTEMPTS) {
        await this.evaluationJobRepository.fail(jobId, message);
      } else {
        await this.evaluationJobRepository.release(jobId, RETRY_DELAY_MS, message);
      }

      metrics.counter('evaluation_jobs_failed_total');
    }
  }

  @TraceDecorator()
  private async evaluateJob(job: ClaimedJob): Promise<void> {
    const evaluationId = String(job.evaluationId);

    setSpanAttributes({ evaluationId, entityId: job.entityId, entityType: job.entityType });

    const [existing] = await this.evaluationRepository.findAll({ _id: evaluationId }, undefined, 1);

    if (existing) {
      await this.evaluationJobRepository.complete(String(job._id));

      return;
    }

    const payload = await this.riskEvaluationService.evaluate({
      entityType: job.entityType,
      entityId: job.entityId,
    });

    await mongoose.connection.transaction(async () => {
      await this.evaluationRepository.create({
        _id: new Types.ObjectId(evaluationId),
        entityType: job.entityType,
        parentId: job.entityId,
        grandParentId: payload.grandParentId,
        ownerId: job.ownerId,
        ownerType: job.ownerType,
        summary: payload.summary,
        sources: payload.sources,
        risk: payload.risk,
        modelUsed: payload.modelUsed,
      });

      await this.outboxPublisher.publish(
        this.outboxPublisher.rabbitClient.getEvaluationExchange(),
        EVALUATION_RESULT_ROUTING_KEY[job.entityType],
        {
          evaluationId,
          entityType: job.entityType,
          entityId: job.entityId,
          riskScore: payload.risk.score,
        },
        evaluationId,
      );

      await this.evaluationJobRepository.complete(String(job._id));
    });
  }
}
