import { Elysia } from 'elysia';
import { withTraceSync } from '@shared/monitoring/src/tracing';
import { ProcessedMessageRepository } from '../repositories/processedMessage.repository';


export const createOrderedConsumerRepositoriesPlugin = () => {
  const processedMessageRepository = withTraceSync(
    'ordered_consumer.init.repositories.processed',
    () => new ProcessedMessageRepository(),
  );

  const plugin = withTraceSync('ordered_consumer.init.repositories.plugin', () =>
    new Elysia({ name: 'OrderedConsumerRepositories' })
      .decorate('processedMessageRepository', processedMessageRepository),
  );

  return plugin;
};

export type OrderedConsumerRepositoriesPlugin = ReturnType<typeof createOrderedConsumerRepositoriesPlugin>;
