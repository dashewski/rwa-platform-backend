import { Elysia } from 'elysia';
import { createSignersManagerClient } from '../clients/eden.clients';
import { RabbitMQClient } from '../clients/rabbitmq.client';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';

export const createClientsPlugin = async (signersManagerUrl: string, rabbitMqUri: string) => {
  const signersManagerClient = withTraceSync('loyalty.init.clients.signers_manager', () =>
    createSignersManagerClient(signersManagerUrl),
  );

  const rabbitMQClient = withTraceSync(
    'loyalty.init.clients.rabbitmq',
    () => new RabbitMQClient(rabbitMqUri),
  );

  await withTraceAsync('loyalty.init.clients.rabbitmq_connect', async () => {
    logger.info('Initializing RabbitMQ client');
    await rabbitMQClient.initialize();
    logger.info('RabbitMQ client initialized successfully');
  });

  const plugin = withTraceSync('loyalty.init.clients.plugin', () =>
    new Elysia({ name: 'Clients' })
      .decorate('signersManagerClient', signersManagerClient)
      .decorate('rabbitMQClient', rabbitMQClient)
      .onStop(async () => {
        await withTraceAsync('loyalty.stop.clients', async () => {
          logger.info('Shutting down RabbitMQ client');
          await rabbitMQClient.disconnect();
        });
      }),
  );

  return plugin;
};

export type ClientsPlugin = Awaited<ReturnType<typeof createClientsPlugin>>;
