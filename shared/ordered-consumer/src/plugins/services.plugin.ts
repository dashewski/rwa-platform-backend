import { Elysia } from 'elysia';
import { withTraceSync } from '@shared/monitoring/src/tracing';
import { OrderedConsumerService } from '../services/orderedConsumer.service';
import type { OrderedConsumerRepositoriesPlugin } from './repositories.plugin';


export const createOrderedConsumerServicesPlugin = (
  repositoriesPlugin: OrderedConsumerRepositoriesPlugin,
  queueName: string,
) => {
  const consumerService = withTraceSync('ordered_consumer.init.services.consumer', () =>
    new OrderedConsumerService(
      queueName,
      repositoriesPlugin.decorator.processedMessageRepository,
    ),
  );

  const plugin = withTraceSync('ordered_consumer.init.services.plugin', () =>
    new Elysia({ name: 'OrderedConsumerServices' })
      .use(repositoriesPlugin)
      .decorate('orderedConsumer', consumerService),
  );

  return plugin;
};

export type OrderedConsumerServicesPlugin = ReturnType<typeof createOrderedConsumerServicesPlugin>;
