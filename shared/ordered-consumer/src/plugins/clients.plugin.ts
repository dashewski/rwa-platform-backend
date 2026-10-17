import { Elysia } from 'elysia';
import { RabbitMQClient } from '@shared/rabbitmq/src/rabbitmq.client';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';


export const createOrderedConsumerClientsPlugin = async (
  rabbitMqUri: string,
  exchange: string,
) => {
  const rabbitMQClient = withTraceSync(
    'ordered_consumer.init.clients.rabbitmq',
    () => new RabbitMQClient({ uri: rabbitMqUri }),
  );

  await withTraceAsync('ordered_consumer.init.clients.rabbitmq_connect', async () => {
    logger.info('Initializing RabbitMQ client');
    await rabbitMQClient.connect();
    logger.info('RabbitMQ client initialized successfully');
  });

  // the clients layer owns the broker connection and the exchange; the queue and its bindings come from the daemon's routing
  await withTraceAsync('ordered_consumer.init.clients.exchange', async () => {
    await rabbitMQClient.setupExchange(exchange, 'direct', { durable: true });
    logger.info(`Ordered consumer exchange declared: ${exchange}`);
  });

  const plugin = withTraceSync('ordered_consumer.init.clients.plugin', () =>
    new Elysia({ name: 'OrderedConsumerClients' })
      .decorate('rabbitMQClient', rabbitMQClient)
      .onStop(async () => {
        await withTraceAsync('ordered_consumer.stop.clients', async () => {
          logger.info('Shutting down RabbitMQ client');
          await rabbitMQClient.disconnect();
        });
      }),
  );

  return plugin;
};

export type OrderedConsumerClientsPlugin = Awaited<ReturnType<typeof createOrderedConsumerClientsPlugin>>;
