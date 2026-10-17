import { Elysia } from 'elysia';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { BlockchainEventsDaemon } from '../daemons/blockchainEvents.daemon';
import type { OrderedConsumerPlugin } from '@shared/ordered-consumer';
import type { ServicesPlugin } from './services.plugin';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';

export const createDaemonsPlugin = async (
  servicesPlugin: ServicesPlugin,
  orderedConsumerPlugin: OrderedConsumerPlugin,
) => {
  const blockchainEventsDaemon = withTraceSync(
    'loyalty.init.daemons.blockchain_events',
    () =>
      new BlockchainEventsDaemon(
        orderedConsumerPlugin.decorator.rabbitMQClient,
        orderedConsumerPlugin.decorator.orderedConsumer,
        servicesPlugin.decorator.loyaltyService,
      ),
  );

  await withTraceAsync('loyalty.init.daemons.initialize', async () => {
    await blockchainEventsDaemon.initialize();
  });

  const plugin = withTraceSync('loyalty.init.daemons.plugin', () =>
    new Elysia({ name: 'Daemons' })
      .use(servicesPlugin)
      .use(orderedConsumerPlugin)
      .decorate('blockchainEventsDaemon', blockchainEventsDaemon)
      .onStop(async () => {
        await withTraceAsync('loyalty.stop.daemons', async () => {
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
