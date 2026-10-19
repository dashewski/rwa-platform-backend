import { Elysia } from 'elysia';
import { InboxConsumerService } from '@shared/inbox-consumer';
import { OutboxPublisherService } from '@shared/outbox-publisher';
import { SignatureService } from '../services/signature.service';
import type { ClientsPlugin } from './clients.plugin';
import type { RepositoriesPlugin } from './repositories.plugin';
import { withTraceSync } from '@shared/monitoring/src/tracing';

export const createServicesPlugin = (
  repositoriesPlugin: RepositoriesPlugin,
  clientsPlugin: ClientsPlugin,
  privateKey: string,
) => {
  const outboxPublisher = withTraceSync(
    'signer.init.services.outbox_publisher',
    () =>
      new OutboxPublisherService(
        clientsPlugin.decorator.rabbitMQClient,
        repositoriesPlugin.decorator.outboxPublisherMessageRepository,
      ),
  );

  const inboxConsumer = withTraceSync(
    'signer.init.services.inbox_consumer',
    () => new InboxConsumerService(repositoriesPlugin.decorator.inboxConsumerMessageRepository),
  );

  const signatureService = withTraceSync(
    'signer.init.services.signature',
    () => new SignatureService(outboxPublisher, privateKey),
  );

  const plugin = withTraceSync('signer.init.services.plugin', () =>
    new Elysia({ name: 'Services' })
      .use(repositoriesPlugin)
      .use(clientsPlugin)
      .decorate('outboxPublisher', outboxPublisher)
      .decorate('inboxConsumer', inboxConsumer)
      .decorate('signatureService', signatureService),
  );

  return plugin;
};

export type ServicesPlugin = ReturnType<typeof createServicesPlugin>;
