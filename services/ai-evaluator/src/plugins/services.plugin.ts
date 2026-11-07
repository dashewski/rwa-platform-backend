import { Elysia } from 'elysia';
import { EvaluationService } from '../services/evaluation.service';
import { JobQueueService } from '@shared/job-queue/src/services/jobQueue.service';
import type { RepositoriesPlugin } from './repositories.plugin';
import type { ClientsPlugin } from './clients.plugin';
import { OutboxPublisherService } from '@shared/outbox-publisher';
import { withTraceSync } from '@shared/monitoring/src/tracing';

export const createServicesPlugin = (
  repositoriesPlugin: RepositoriesPlugin,
  clientsPlugin: ClientsPlugin,
  openRouterModel: string,
  maxFilesPerRequest: number,
  cooldownSeconds: number,
) => {
  const outboxPublisherService = withTraceSync(
    'ai-evaluator.init.services.outbox_publisher',
    () =>
      new OutboxPublisherService(
        clientsPlugin.decorator.rabbitMQClient,
        repositoriesPlugin.decorator.outboxPublisherMessageRepository,
      ),
  );

  const jobQueueService = withTraceSync(
    'ai-evaluator.init.services.job_runner',
    () => new JobQueueService(clientsPlugin.decorator.jobQueueClient),
  );

  const evaluationService = withTraceSync(
    'ai-evaluator.init.services.evaluation',
    () =>
      new EvaluationService(
        repositoriesPlugin.decorator.evaluationRepository,
        jobQueueService,
        clientsPlugin.decorator.jobQueueClient,
        clientsPlugin.decorator.openRouterClient,
        clientsPlugin.decorator.rwaClient,
        clientsPlugin.decorator.documentsClient,
        clientsPlugin.decorator.galleryClient,
        clientsPlugin.decorator.reactionsClient,
        clientsPlugin.decorator.questionsClient,
        clientsPlugin.decorator.portfolioClient,
        outboxPublisherService,
        openRouterModel,
        maxFilesPerRequest,
        cooldownSeconds,
      ),
  );

  const plugin = withTraceSync('ai-evaluator.init.services.plugin', () =>
    new Elysia({ name: 'Services' })
      .use(repositoriesPlugin)
      .use(clientsPlugin)
      .decorate('outboxPublisherService', outboxPublisherService)
      .decorate('jobQueueService', jobQueueService)
      .decorate('evaluationService', evaluationService),
  );

  return plugin;
};

export type ServicesPlugin = ReturnType<typeof createServicesPlugin>;
