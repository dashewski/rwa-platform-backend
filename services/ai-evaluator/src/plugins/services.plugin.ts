import { Elysia } from 'elysia';
import { EvaluationService } from '../services/evaluation.service';
import { InboxConsumerService } from '@shared/inbox-consumer';
import type { RepositoriesPlugin } from './repositories.plugin';
import type { ClientsPlugin } from './clients.plugin';
import { OutboxPublisherService } from '@shared/outbox-publisher';
import { withTraceSync } from '@shared/monitoring/src/tracing';

export const createServicesPlugin = (
  repositoriesPlugin: RepositoriesPlugin,
  clientsPlugin: ClientsPlugin,
  openRouterModel: string,
  maxFilesPerRequest: number,
) => {
  const outboxPublisherService = withTraceSync(
    'ai-evaluator.init.services.outbox_publisher',
    () =>
      new OutboxPublisherService(
        clientsPlugin.decorator.rabbitMQClient,
        repositoriesPlugin.decorator.outboxPublisherMessageRepository,
      ),
  );

  const inboxConsumerService = withTraceSync(
    'ai-evaluator.init.services.inbox_consumer',
    () => new InboxConsumerService(repositoriesPlugin.decorator.inboxConsumerMessageRepository),
  );

  const evaluationService = withTraceSync(
    'ai-evaluator.init.services.evaluation',
    () =>
      new EvaluationService(
        repositoriesPlugin.decorator.evaluationRepository,
        repositoriesPlugin.decorator.evaluationLockRepository,
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
      ),
  );

  const plugin = withTraceSync('ai-evaluator.init.services.plugin', () =>
    new Elysia({ name: 'Services' })
      .use(repositoriesPlugin)
      .use(clientsPlugin)
      .decorate('outboxPublisherService', outboxPublisherService)
      .decorate('inboxConsumerService', inboxConsumerService)
      .decorate('evaluationService', evaluationService),
  );

  return plugin;
};

export type ServicesPlugin = ReturnType<typeof createServicesPlugin>;
