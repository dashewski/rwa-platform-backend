import { Elysia } from 'elysia';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { InboxConsumerDaemon } from '../daemons/inboxConsumer.daemon';
import { OutboxPublisherDaemon } from '../daemons/outboxPublisher.daemon';
import type { ServicesPlugin } from './services.plugin';
import type { ClientsPlugin } from './clients.plugin';
import { withTraceAsync, withTraceSync } from '@shared/monitoring/src/tracing';

export const createDaemonsPlugin = async (servicesPlugin: ServicesPlugin, clientsPlugin: ClientsPlugin) => {
  const inboxConsumerDaemon = withTraceSync(
    'signer.init.daemons.inbox_consumer',
    () =>
      new InboxConsumerDaemon(
        clientsPlugin.decorator.rabbitMQClient,
        servicesPlugin.decorator.inboxConsumer,
        servicesPlugin.decorator.signatureService,
      ),
  );

  const outboxPublisherDaemon = withTraceSync(
    'signer.init.daemons.outbox_publisher',
    () => new OutboxPublisherDaemon(servicesPlugin.decorator.outboxPublisher),
  );

  await withTraceAsync('signer.init.daemons.initialize', async () => {
    await inboxConsumerDaemon.initialize();
    await outboxPublisherDaemon.initialize();
    logger.info('Daemons started');
  });

  const plugin = withTraceSync('signer.init.daemons.plugin', () =>
    new Elysia({ name: 'Daemons' })
      .use(servicesPlugin)
      .use(clientsPlugin)
      .decorate('inboxConsumerDaemon', inboxConsumerDaemon)
      .decorate('outboxPublisherDaemon', outboxPublisherDaemon)
      .onStop(async () => {
        await withTraceAsync('signer.stop.daemons', async () => {
          inboxConsumerDaemon.stop();
          outboxPublisherDaemon.stop();
          logger.info('Daemons stopped');
        });
      }),
  );

  return plugin;
};

export type DaemonsPlugin = Awaited<ReturnType<typeof createDaemonsPlugin>>;
