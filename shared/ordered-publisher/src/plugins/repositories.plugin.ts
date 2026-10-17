import { Elysia } from 'elysia';
import { withTraceSync } from '@shared/monitoring/src/tracing';
import { OutboxMessageRepository } from '../repositories/outboxMessage.repository';


export const createOrderedPublisherRepositoriesPlugin = () => {
  const outboxMessageRepository = withTraceSync(
    'ordered_publisher.init.repositories.outbox',
    () => new OutboxMessageRepository(),
  );

  const plugin = withTraceSync('ordered_publisher.init.repositories.plugin', () =>
    new Elysia({ name: 'OrderedPublisherRepositories' })
      .decorate('outboxMessageRepository', outboxMessageRepository),
  );

  return plugin;
};

export type OrderedPublisherRepositoriesPlugin = ReturnType<typeof createOrderedPublisherRepositoriesPlugin>;
