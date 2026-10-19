import { Elysia } from 'elysia';
import { InboxConsumerDaemon } from '../daemons/inboxConsumer.daemon';
import type { ServicesPlugin } from './services.plugin';
import type { ClientsPlugin } from './clients.plugin';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';
import { logger } from '@shared/monitoring/src/monitoring.plugin';

export const createDaemonsPlugin = async (servicesPlugin: ServicesPlugin, clientsPlugin: ClientsPlugin) => {
  const inboxConsumerDaemon = withTraceSync('rwa.init.daemons.inbox_consumer', () =>
    new InboxConsumerDaemon(
      clientsPlugin.decorator.rabbitMQClient,
      servicesPlugin.decorator.inboxConsumer,
      servicesPlugin.decorator.businessService,
      servicesPlugin.decorator.poolService,
    ),
  );

  await withTraceAsync('rwa.init.daemons_plugin.start', async () => {
    await inboxConsumerDaemon.initialize();
    logger.info('Daemons started');
  });

  const plugin = withTraceSync('rwa.init.daemons.plugin', () =>
    new Elysia({ name: 'Daemons' })
      .use(servicesPlugin)
      .use(clientsPlugin)
      .decorate('inboxConsumerDaemon', inboxConsumerDaemon)
      .onStop(async () => {
        await withTraceAsync('rwa.stop.daemons_plugin', async () => {
          inboxConsumerDaemon.stop();
          logger.info('Daemons stopped');
        });
      }),
  );

  return plugin;
};

export type DaemonsPlugin = Awaited<ReturnType<typeof createDaemonsPlugin>>;
