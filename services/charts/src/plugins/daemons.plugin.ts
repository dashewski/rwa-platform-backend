import { Elysia } from 'elysia';
import { InboxConsumerDaemon } from '../daemons/inboxConsumer.daemon';
import type { ServicesPlugin } from './services.plugin';
import type { ClientsPlugin } from './clients.plugin';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';
import { logger } from '@shared/monitoring/src/monitoring.plugin';

export const createDaemonsPlugin = async (servicesPlugin: ServicesPlugin, clientsPlugin: ClientsPlugin) => {
  const inboxConsumerDaemon = withTraceSync(
    'charts.init.daemons.inbox_consumer',
    () =>
      new InboxConsumerDaemon(
        clientsPlugin.decorator.rabbitMQClient,
        servicesPlugin.decorator.inboxConsumer,
        servicesPlugin.decorator.chartsService,
        servicesPlugin.decorator.transactionsService,
      ),
  );

  await withTraceAsync('charts.init.daemons.initialize', async () => {
    await inboxConsumerDaemon.initialize();
  });

  const plugin = withTraceSync('charts.init.daemons.plugin', () =>
    new Elysia({ name: 'Daemons' })
      .use(servicesPlugin)
      .use(clientsPlugin)
      .decorate('inboxConsumerDaemon', inboxConsumerDaemon)
      .onStop(async () => {
        await withTraceAsync('charts.stop.daemons', async () => {
          if (inboxConsumerDaemon) {
            await inboxConsumerDaemon.stop();
            logger.info('Inbox consumer daemon stopped');
          }
        });
      }),
  );

  return plugin;
};

export type DaemonsPlugin = Awaited<ReturnType<typeof createDaemonsPlugin>>;
