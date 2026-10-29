import { Elysia } from 'elysia';
import { RiskEvaluationService } from '../services/riskEvaluation.service';
import type { RepositoriesPlugin } from './repositories.plugin';
import type { ClientsPlugin } from './clients.plugin';
import { InboxConsumerService } from '@shared/inbox-consumer';
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

  const riskEvaluationService = withTraceSync(
    'ai-evaluator.init.services.risk_evaluation',
    () =>
      new RiskEvaluationService(
        repositoriesPlugin.decorator.evaluationRepository,
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
      .decorate('riskEvaluationService', riskEvaluationService),
  );

  return plugin;
};

export type ServicesPlugin = ReturnType<typeof createServicesPlugin>;
