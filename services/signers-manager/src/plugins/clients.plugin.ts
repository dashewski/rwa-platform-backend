import { Elysia } from 'elysia';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { RabbitMQClient } from '../clients/rabbitmq.client';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';

export const createClientsPlugin = async (rabbitMqUri: string) => {
  const rabbitMQClient = withTraceSync('signers-manager.init.clients.rabbitmq', () => new RabbitMQClient(rabbitMqUri));

  await withTraceAsync('signers-manager.init.clients.rabbitmq_connect', async () => {
    logger.info('Initializing RabbitMQ client');
    await rabbitMQClient.initialize();
    logger.info('RabbitMQ client initialized successfully');
  });

  const plugin = withTraceSync('signers-manager.init.clients.plugin', () =>
    new Elysia({ name: 'Clients' }).decorate('rabbitMQClient', rabbitMQClient).onStop(async () => {
      await withTraceAsync('signers-manager.stop.clients', async () => {
        logger.info('Shutting down RabbitMQ client');
        await rabbitMQClient.disconnect();
        logger.info('RabbitMQ client shut down successfully');
      });
    }),
  );

  return plugin;
};

export type ClientsPlugin = Awaited<ReturnType<typeof createClientsPlugin>>;
