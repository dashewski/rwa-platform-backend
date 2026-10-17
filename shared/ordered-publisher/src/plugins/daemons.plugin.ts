import { Elysia } from 'elysia';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';
import { OrderedPublisherDaemon } from '../daemons/orderedPublisher.daemon';
import type { OrderedPublisherServicesPlugin } from './services.plugin';


export const createOrderedPublisherDaemonsPlugin = async (
  servicesPlugin: OrderedPublisherServicesPlugin,
  pollIntervalMs: number = 500,
) => {
  const publisherDaemon = withTraceSync('ordered_publisher.init.daemons.publisher', () =>
    new OrderedPublisherDaemon(servicesPlugin.decorator.orderedPublisher, pollIntervalMs),
  );

  await withTraceAsync('ordered_publisher.init.daemons.initialize', async () => {
    publisherDaemon.initialize();
    logger.info('Ordered publisher daemon initialized');
  });

  const plugin = withTraceSync('ordered_publisher.init.daemons.plugin', () =>
    new Elysia({ name: 'OrderedPublisherDaemons' })
      .use(servicesPlugin)
      .decorate('orderedPublisherDaemon', publisherDaemon)
      .onStop(async () => {
        await withTraceAsync('ordered_publisher.stop.daemons', async () => {
          publisherDaemon.stop();
          logger.info('Ordered publisher daemon stopped');
        });
      }),
  );

  return plugin;
};

export type OrderedPublisherDaemonsPlugin = Awaited<ReturnType<typeof createOrderedPublisherDaemonsPlugin>>;
