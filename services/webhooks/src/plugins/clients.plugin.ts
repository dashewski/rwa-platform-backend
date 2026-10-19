import { Elysia } from 'elysia';
import { RabbitMQClient } from '@shared/rabbitmq/src/rabbitmq.client';
import { RedisWithTracing } from '@shared/monitoring/src/redis';
import { WebhookEventsClient } from '../clients/webhookEvents.client';
import { WebhookDeliveryClient } from '../clients/webhookDelivery.client';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';

export const createClientsPlugin = async (
  rabbitMqUri: string,
  redisUrl: string,
) => {
  const rabbitMQClient = withTraceSync(
    'webhooks.init.clients.rabbitmq',
    () =>
      new RabbitMQClient({
        uri: rabbitMqUri,
        channelName: 'webhooks',
      }),
  );

  const redisClient = withTraceSync('webhooks.init.clients.redis', () => new RedisWithTracing(redisUrl));

  const webhookEventsClient = withTraceSync(
    'webhooks.init.clients.webhook_events',
    () => new WebhookEventsClient(rabbitMQClient),
  );

  const webhookDeliveryClient = withTraceSync(
    'webhooks.init.clients.webhook_delivery',
    () => new WebhookDeliveryClient(rabbitMQClient),
  );

  await withTraceAsync('webhooks.init.clients.rabbitmq_connect', async () => {
    logger.debug('Initializing RabbitMQ client');
    await rabbitMQClient.connect();
    await webhookEventsClient.initialize();
    await webhookDeliveryClient.initialize();
    logger.info('RabbitMQ client connected, queues initialized');
  });

  const plugin = withTraceSync('webhooks.init.clients.plugin', () =>
    new Elysia({ name: 'Clients' })
      .decorate('rabbitMQClient', rabbitMQClient)
      .decorate('redisClient', redisClient)
      .decorate('webhookEventsClient', webhookEventsClient)
      .decorate('webhookDeliveryClient', webhookDeliveryClient)
      .onStop(async () => {
        await withTraceAsync('webhooks.stop.clients', async () => {
          await rabbitMQClient.disconnect();
          await redisClient.quit();
          logger.info('Clients disconnected');
        });
      }),
  );

  return plugin;
};

export type ClientsPlugin = Awaited<ReturnType<typeof createClientsPlugin>>;
