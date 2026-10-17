import { Elysia } from 'elysia';
import { BlockchainEventsDaemon } from '../daemons/blockchainEvents.daemon';
import type { OrderedConsumerPlugin } from '@shared/ordered-consumer';
import type { ServicesPlugin } from './services.plugin';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';
import { logger } from '@shared/monitoring/src/monitoring.plugin';

export const createDaemonsPlugin = async (
  servicesPlugin: ServicesPlugin,
  orderedConsumerPlugin: OrderedConsumerPlugin,
) => {
  const blockchainEventsDaemon = withTraceSync(
    'dao.init.daemons.blockchain_events',
    () =>
      new BlockchainEventsDaemon(
        orderedConsumerPlugin.decorator.rabbitMQClient,
        orderedConsumerPlugin.decorator.orderedConsumer,
        servicesPlugin.decorator.daoService,
      ),
  );

  await withTraceAsync('dao.init.daemons.initialize', async () => {
    await blockchainEventsDaemon.initialize();
  });

  const plugin = withTraceSync('dao.init.daemons.plugin', () =>
    new Elysia({ name: 'Daemons' })
      .use(servicesPlugin)
      .use(orderedConsumerPlugin)
      .decorate('blockchainEventsDaemon', blockchainEventsDaemon)
      .onStop(async () => {
        await withTraceAsync('dao.stop.daemons', async () => {
          if (blockchainEventsDaemon) {
            await blockchainEventsDaemon.stop();
            logger.info('Blockchain events daemon stopped');
          }
        });
      }),
  );

  return plugin;
};

export type DaemonsPlugin = Awaited<ReturnType<typeof createDaemonsPlugin>>;
