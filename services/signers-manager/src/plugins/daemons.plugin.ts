import { Elysia } from 'elysia';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { InboxConsumerDaemon } from '../daemons/inboxConsumer.daemon';
import { OutboxPublisherDaemon } from '../daemons/outboxPublisher.daemon';
import type { ClientsPlugin } from './clients.plugin';
import type { ServicesPlugin } from './services.plugin';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';

export const createDaemonsPlugin = async (clientsPlugin: ClientsPlugin, servicesPlugin: ServicesPlugin) => {
  const inboxConsumerDaemon = withTraceSync(
    'signers-manager.init.daemons.inbox_consumer',
    () =>
      new InboxConsumerDaemon(
        clientsPlugin.decorator.rabbitMQClient,
        servicesPlugin.decorator.inboxConsumerService,
        servicesPlugin.decorator.signaturesService,
      ),
  );

  const outboxPublisherDaemon = withTraceSync(
    'signers-manager.init.daemons.outbox_publisher',
    () => new OutboxPublisherDaemon(servicesPlugin.decorator.outboxPublisherService, clientsPlugin.decorator.rabbitMQClient),
  );

  await withTraceAsync('signers-manager.init.daemons.initialize', async () => {
    await inboxConsumerDaemon.initialize();
    await outboxPublisherDaemon.initialize();
    logger.info('Daemons started');
  });

  const plugin = withTraceSync('signers-manager.init.daemons.plugin', () =>
    new Elysia({ name: 'Daemons' })
      .use(clientsPlugin)
      .use(servicesPlugin)
      .decorate('inboxConsumerDaemon', inboxConsumerDaemon)
      .decorate('outboxPublisherDaemon', outboxPublisherDaemon)
      .onStop(async () => {
        await withTraceAsync('signers-manager.stop.daemons', async () => {
          inboxConsumerDaemon.stop();
          outboxPublisherDaemon.stop();
          logger.info('Daemons stopped');
        });
      }),
  );

  return plugin;
};

export type DaemonsPlugin = Awaited<ReturnType<typeof createDaemonsPlugin>>;
