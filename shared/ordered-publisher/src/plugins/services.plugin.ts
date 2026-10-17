import { Elysia } from 'elysia';
import { withTraceSync } from '@shared/monitoring/src/tracing';
import { OrderedPublisherService } from '../services/orderedPublisher.service';
import type { OrderedPublisherRepositoriesPlugin } from './repositories.plugin';
import type { OrderedPublisherClientsPlugin } from './clients.plugin';


export const createOrderedPublisherServicesPlugin = (
  repositoriesPlugin: OrderedPublisherRepositoriesPlugin,
  clientsPlugin: OrderedPublisherClientsPlugin,
  exchange: string,
) => {
  const publisherService = withTraceSync('ordered_publisher.init.services.publisher', () =>
    new OrderedPublisherService(
      clientsPlugin.decorator.rabbitMQClient,
      exchange,
      repositoriesPlugin.decorator.outboxMessageRepository,
    ),
  );

  const plugin = withTraceSync('ordered_publisher.init.services.plugin', () =>
    new Elysia({ name: 'OrderedPublisherServices' })
      .use(repositoriesPlugin)
      .use(clientsPlugin)
      .decorate('orderedPublisher', publisherService),
  );

  return plugin;
};

export type OrderedPublisherServicesPlugin = ReturnType<typeof createOrderedPublisherServicesPlugin>;
