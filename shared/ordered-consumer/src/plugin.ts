import { Elysia } from 'elysia';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { withTraceSync } from '@shared/monitoring/src/tracing';
import { createOrderedConsumerRepositoriesPlugin } from './plugins/repositories.plugin';
import { createOrderedConsumerClientsPlugin } from './plugins/clients.plugin';
import { createOrderedConsumerServicesPlugin } from './plugins/services.plugin';

export const createOrderedConsumerPlugin = async (
  rabbitMqUri: string,
  exchange: string,
  queueName: string,
) => {
  const repositoriesPlugin = createOrderedConsumerRepositoriesPlugin();
  const clientsPlugin = await createOrderedConsumerClientsPlugin(rabbitMqUri, exchange);
  const servicesPlugin = createOrderedConsumerServicesPlugin(repositoriesPlugin, queueName);

  const plugin = withTraceSync('ordered_consumer.init.plugin', () =>
    new Elysia({ name: 'OrderedConsumer' })
      .use(repositoriesPlugin)
      .use(clientsPlugin)
      .use(servicesPlugin),
  );

  logger.info('Ordered consumer plugin assembled (repositories -> clients -> services)');

  return plugin;
};

export type OrderedConsumerPlugin = Awaited<ReturnType<typeof createOrderedConsumerPlugin>>;
