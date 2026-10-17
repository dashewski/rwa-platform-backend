import { Elysia } from 'elysia';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { withTraceSync } from '@shared/monitoring/src/tracing';
import { createOrderedPublisherRepositoriesPlugin } from './plugins/repositories.plugin';
import { createOrderedPublisherClientsPlugin } from './plugins/clients.plugin';
import { createOrderedPublisherServicesPlugin } from './plugins/services.plugin';
import { createOrderedPublisherDaemonsPlugin } from './plugins/daemons.plugin';

export const createOrderedPublisherPlugin = async (
  rabbitMqUri: string,
  exchange: string,
  pollIntervalMs: number = 500,
) => {
  const repositoriesPlugin = createOrderedPublisherRepositoriesPlugin();
  const clientsPlugin = await createOrderedPublisherClientsPlugin(rabbitMqUri, exchange);
  const servicesPlugin = createOrderedPublisherServicesPlugin(repositoriesPlugin, clientsPlugin, exchange);
  const daemonsPlugin = await createOrderedPublisherDaemonsPlugin(servicesPlugin, pollIntervalMs);

  const plugin = withTraceSync('ordered_publisher.init.plugin', () =>
    new Elysia({ name: 'OrderedPublisher' })
      .use(repositoriesPlugin)
      .use(clientsPlugin)
      .use(servicesPlugin)
      .use(daemonsPlugin),
  );

  logger.info('Ordered publisher plugin assembled (repositories -> clients -> services -> daemons)');

  return plugin;
};

export type OrderedPublisherPlugin = Awaited<ReturnType<typeof createOrderedPublisherPlugin>>;
