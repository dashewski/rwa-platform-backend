import { Elysia } from 'elysia';
import { RabbitMQClient } from '../clients/rabbitmq.client';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';

export const createClientsPlugin = async (rabbitMqUri: string, chainIds: string[]) => {
  const rabbitMQClient = withTraceSync('dao.init.clients.rabbitmq', () => new RabbitMQClient(rabbitMqUri, chainIds));

  await withTraceAsync('dao.init.clients.rabbitmq_connect', async () => {
    logger.info('Initializing RabbitMQ client');
    await rabbitMQClient.initialize();
    logger.info('RabbitMQ client initialized successfully');
  });

  const plugin = withTraceSync('dao.init.clients.plugin', () =>
    new Elysia({ name: 'Clients' }).decorate('rabbitMQClient', rabbitMQClient).onStop(async () => {
      await withTraceAsync('dao.stop.clients', async () => {
        logger.info('Shutting down RabbitMQ client');
        await rabbitMQClient.disconnect();
      });
    }),
  );

  return plugin;
};

export type ClientsPlugin = Awaited<ReturnType<typeof createClientsPlugin>>;
