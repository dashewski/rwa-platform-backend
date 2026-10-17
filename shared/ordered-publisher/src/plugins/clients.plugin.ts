import { Elysia } from 'elysia';
import { RabbitMQClient } from '@shared/rabbitmq/src/rabbitmq.client';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';


export const createOrderedPublisherClientsPlugin = async (rabbitMqUri: string, exchange: string) => {
  const rabbitMQClient = withTraceSync(
    'ordered_publisher.init.clients.rabbitmq',
    () => new RabbitMQClient({ uri: rabbitMqUri }),
  );

  await withTraceAsync('ordered_publisher.init.clients.rabbitmq_connect', async () => {
    logger.info('Initializing RabbitMQ client');
    await rabbitMQClient.connect();
    logger.info('RabbitMQ client initialized successfully');
  });

  await withTraceAsync('ordered_publisher.init.clients.exchange', () =>
    rabbitMQClient.setupExchange(exchange, 'direct', { durable: true }),
  );

  const plugin = withTraceSync('ordered_publisher.init.clients.plugin', () =>
    new Elysia({ name: 'OrderedPublisherClients' })
      .decorate('rabbitMQClient', rabbitMQClient)
      .onStop(async () => {
        await withTraceAsync('ordered_publisher.stop.clients', async () => {
          logger.info('Shutting down RabbitMQ client');
          await rabbitMQClient.disconnect();
        });
      }),
  );

  return plugin;
};

export type OrderedPublisherClientsPlugin = Awaited<ReturnType<typeof createOrderedPublisherClientsPlugin>>;
