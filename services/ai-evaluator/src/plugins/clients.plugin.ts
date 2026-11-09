import { Elysia } from 'elysia';
import { OpenRouterClient } from '@shared/openrouter/client';
import { RabbitMQClient } from '../clients/rabbitmq.client';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';
import {
  createRwaClient,
  createDocumentsClient,
  createGalleryClient,
  createReactionsClient,
  createQuestionsClient,
  createPortfolioClient,
} from '../clients/eden.clients';

export const createClientsPlugin = async (
  openRouterApiKey: string,
  openRouterBaseUrl: string,
  rwaServiceUrl: string,
  documentsServiceUrl: string,
  galleryServiceUrl: string,
  reactionsServiceUrl: string,
  questionsServiceUrl: string,
  portfolioServiceUrl: string,
  rabbitMqUri: string,
) => {
  const openRouterClient = withTraceSync(
    'ai-evaluator.init.clients.openrouter',
    () => new OpenRouterClient(openRouterApiKey, openRouterBaseUrl),
  );

  const rwaClient = withTraceSync('ai-evaluator.init.clients.rwa', () => createRwaClient(rwaServiceUrl));

  const documentsClient = withTraceSync('ai-evaluator.init.clients.documents', () =>
    createDocumentsClient(documentsServiceUrl),
  );

  const galleryClient = withTraceSync('ai-evaluator.init.clients.gallery', () =>
    createGalleryClient(galleryServiceUrl),
  );

  const reactionsClient = withTraceSync('ai-evaluator.init.clients.reactions', () =>
    createReactionsClient(reactionsServiceUrl),
  );

  const questionsClient = withTraceSync('ai-evaluator.init.clients.questions', () =>
    createQuestionsClient(questionsServiceUrl),
  );

  const portfolioClient = withTraceSync('ai-evaluator.init.clients.portfolio', () =>
    createPortfolioClient(portfolioServiceUrl),
  );

  const rabbitMQClient = withTraceSync('ai-evaluator.init.clients.rabbitmq', () => new RabbitMQClient(rabbitMqUri));

  await withTraceAsync('ai-evaluator.init.clients.rabbitmq_connect', async () => {
    logger.debug('Initializing RabbitMQ client');
    await rabbitMQClient.initialize();
    logger.info('RabbitMQ client initialized');
  });

  const plugin = withTraceSync('ai-evaluator.init.clients.plugin', () =>
    new Elysia({ name: 'Clients' })
      .decorate('openRouterClient', openRouterClient)
      .decorate('rwaClient', rwaClient)
      .decorate('documentsClient', documentsClient)
      .decorate('galleryClient', galleryClient)
      .decorate('reactionsClient', reactionsClient)
      .decorate('questionsClient', questionsClient)
      .decorate('portfolioClient', portfolioClient)
      .decorate('rabbitMQClient', rabbitMQClient)
      .onStop(async () => {
        await withTraceAsync('ai-evaluator.stop.clients', async () => {
          await rabbitMQClient.disconnect();
          logger.info('Clients disconnected');
        });
      }),
  );

  return plugin;
};

export type ClientsPlugin = Awaited<ReturnType<typeof createClientsPlugin>>;
