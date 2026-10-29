import { Elysia } from 'elysia';
import { InboxConsumerDaemon } from '../daemons/inboxConsumer.daemon';
import { OutboxPublisherDaemon } from '../daemons/outboxPublisher.daemon';
import type { ServicesPlugin } from './services.plugin';
import type { ClientsPlugin } from './clients.plugin';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';
import { logger } from '@shared/monitoring/src/monitoring.plugin';

export const createDaemonsPlugin = async (servicesPlugin: ServicesPlugin, clientsPlugin: ClientsPlugin) => {
  const inboxConsumerDaemon = withTraceSync(
    'rwa.init.daemons.inbox_consumer',
    () =>
      new InboxConsumerDaemon(
        clientsPlugin.decorator.rabbitMQClient,
        servicesPlugin.decorator.inboxConsumerService,
        servicesPlugin.decorator.businessService,
        servicesPlugin.decorator.poolService,
      ),
  );

  const outboxPublisherDaemon = withTraceSync(
    'rwa.init.daemons.outbox_publisher',
    () => new OutboxPublisherDaemon(servicesPlugin.decorator.outboxPublisherService, clientsPlugin.decorator.rabbitMQClient),
  );

  await withTraceAsync('rwa.init.daemons_plugin.start', async () => {
    await inboxConsumerDaemon.initialize();
    await outboxPublisherDaemon.initialize();
    logger.info('Daemons started');
  });

  const plugin = withTraceSync('rwa.init.daemons.plugin', () =>
    new Elysia({ name: 'Daemons' })
      .use(servicesPlugin)
      .use(clientsPlugin)
      .decorate('inboxConsumerDaemon', inboxConsumerDaemon)
      .decorate('outboxPublisherDaemon', outboxPublisherDaemon)
      .onStop(async () => {
        await withTraceAsync('rwa.stop.daemons_plugin', async () => {
          await inboxConsumerDaemon.stop();
          outboxPublisherDaemon.stop();
          logger.info('Daemons stopped');
        });
      }),
  );

  return plugin;
};

export type DaemonsPlugin = Awaited<ReturnType<typeof createDaemonsPlugin>>;
