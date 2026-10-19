import { Elysia } from 'elysia';
import { InboxConsumerService } from '@shared/inbox-consumer';
import { OutboxPublisherService } from '@shared/outbox-publisher';
import { SignaturesService } from '../services/signatures.service';
import type { ClientsPlugin } from './clients.plugin';
import type { RepositoriesPlugin } from './repositories.plugin';
import { withTraceSync } from '@shared/monitoring/src/tracing';

export const createServicesPlugin = (repositoriesPlugin: RepositoriesPlugin, clientsPlugin: ClientsPlugin) => {
  const outboxPublisher = withTraceSync('signers-manager.init.services.outbox_publisher', () =>
    new OutboxPublisherService(
      clientsPlugin.decorator.rabbitMQClient,
      repositoriesPlugin.decorator.outboxPublisherMessageRepository,
    ),
  );

  const inboxConsumer = withTraceSync('signers-manager.init.services.inbox_consumer', () =>
    new InboxConsumerService(
      repositoriesPlugin.decorator.inboxConsumerMessageRepository,
    ),
  );

  const signaturesService = withTraceSync(
    'signers-manager.init.services.signatures',
    () =>
      new SignaturesService(
        repositoriesPlugin.decorator.signatureRepository,
        repositoriesPlugin.decorator.signatureTaskRepository,
        outboxPublisher,
      ),
  );

  const plugin = withTraceSync('signers-manager.init.services.plugin', () =>
    new Elysia({ name: 'Services' })
      .use(repositoriesPlugin)
      .use(clientsPlugin)
      .decorate('outboxPublisher', outboxPublisher)
      .decorate('inboxConsumer', inboxConsumer)
      .decorate('signaturesService', signaturesService),
  );

  return plugin;
};

export type ServicesPlugin = ReturnType<typeof createServicesPlugin>;
