import { Elysia } from 'elysia';
import { BlockchainEventsDaemon } from '../daemons/blockchainEvents.daemon';
import type { OrderedConsumerPlugin } from '@shared/ordered-consumer';
import type { ServicesPlugin } from './services.plugin';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';

export const createDaemonsPlugin = async (
  servicesPlugin: ServicesPlugin,
  orderedConsumerPlugin: OrderedConsumerPlugin,
) => {
  const blockchainEventsDaemon = withTraceSync(
    'charts.init.daemons.blockchain_events',
    () =>
      new BlockchainEventsDaemon(
        orderedConsumerPlugin.decorator.rabbitMQClient,
        orderedConsumerPlugin.decorator.orderedConsumer,
        servicesPlugin.decorator.chartsService,
        servicesPlugin.decorator.transactionsService,
      ),
  );

  await withTraceAsync('charts.init.daemons.initialize', async () => {
    await blockchainEventsDaemon.initialize();
  });

  const plugin = withTraceSync('charts.init.daemons.plugin', () =>
    new Elysia({ name: 'Daemons' })
      .use(servicesPlugin)
      .use(orderedConsumerPlugin)
      .decorate('blockchainEventsDaemon', blockchainEventsDaemon)
      .onStop(async () => {
        await withTraceAsync('charts.stop.daemons', async () => {
          if (blockchainEventsDaemon) {
            await blockchainEventsDaemon.stop();
          }
        });
      }),
  );

  return plugin;
};

export type DaemonsPlugin = Awaited<ReturnType<typeof createDaemonsPlugin>>;
