import { Elysia } from 'elysia';
import { OpenRouterClient } from '@shared/openrouter/client';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { RabbitMQClient } from '../clients/rabbitmq.client';
import { createSignersManagerClient } from '../clients/eden.clients';
import { AiEvaluatorClient } from '../clients/aiEvaluator.client';
import { RedisEventsClient } from '@shared/redis-events/src/redis-events.client';
import { PoolEventsClient } from '../clients/poolEvents.client';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';

export const createClientsPlugin = async (
  redisUrl: string,
  serviceName: string,
  openRouterApiKey: string,
  openRouterBaseUrl: string,
  rabbitMqUri: string,
  signersManagerUrl: string,
  aiEvaluatorUrl: string,
) => {
  const signersManagerClient = withTraceSync('rwa.init.clients.signers_manager', () =>
    createSignersManagerClient(signersManagerUrl),
  );

  const aiEvaluatorClient = withTraceSync('rwa.init.clients.ai_evaluator', () => new AiEvaluatorClient(aiEvaluatorUrl));

  const redisEventsClient = withTraceSync(
    'rwa.init.clients.redis_events',
    () => new RedisEventsClient(redisUrl, serviceName),
  );

  const poolEventsClient = withTraceSync('rwa.init.clients.pool_events', () => new PoolEventsClient(redisEventsClient));

  const openRouterClient = withTraceSync(
    'rwa.init.clients.openrouter',
    () => new OpenRouterClient(openRouterApiKey, openRouterBaseUrl),
  );

  const rabbitMQClient = withTraceSync('rwa.init.clients.rabbitmq', () => new RabbitMQClient(rabbitMqUri));

  await withTraceAsync('rwa.init.clients.rabbitmq_connect', async () => {
    logger.debug('Initializing clients');
    await rabbitMQClient.initialize();
    logger.info('RabbitMQ client initialized');
  });

  const plugin = withTraceSync('rwa.init.clients.plugin', () =>
    new Elysia({ name: 'Clients' })
      .decorate('signersManagerClient', signersManagerClient)
      .decorate('aiEvaluatorClient', aiEvaluatorClient)
      .decorate('redisEventsClient', redisEventsClient)
      .decorate('poolEventsClient', poolEventsClient)
      .decorate('openRouterClient', openRouterClient)
      .decorate('rabbitMQClient', rabbitMQClient)
      .onStop(async () => {
        await withTraceAsync('rwa.stop.clients', async () => {
          await rabbitMQClient.disconnect();
          await redisEventsClient.close();
          logger.info('Clients disconnected');
        });
      }),
  );

  return plugin;
};

export type ClientsPlugin = Awaited<ReturnType<typeof createClientsPlugin>>;
