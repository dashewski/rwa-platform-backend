import { Elysia } from 'elysia';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { BlockchainEventsDaemon } from '../daemons/blockchainEvents.daemon';
import { EvaluationResultsDaemon } from '../daemons/evaluationResults.daemon';
import type { ClientsPlugin } from './clients.plugin';
import type { ServicesPlugin } from './services.plugin';
import type { OrderedConsumerPlugin } from '@shared/ordered-consumer';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';

export const createDaemonsPlugin = async (
  clientsPlugin: ClientsPlugin,
  servicesPlugin: ServicesPlugin,
  orderedConsumerPlugin: OrderedConsumerPlugin,
) => {
  const blockchainEventsDaemon = withTraceSync(
    'rwa.init.daemons.blockchain_events',
    () =>
      new BlockchainEventsDaemon(
        orderedConsumerPlugin.decorator.rabbitMQClient,
        orderedConsumerPlugin.decorator.orderedConsumer,
        servicesPlugin.decorator.businessService,
        servicesPlugin.decorator.poolService,
      ),
  );

  const evaluationResultsDaemon = withTraceSync(
    'rwa.init.daemons.evaluation_results',
    () =>
      new EvaluationResultsDaemon(
        clientsPlugin.decorator.rabbitMQClient,
        servicesPlugin.decorator.poolService,
        servicesPlugin.decorator.businessService,
      ),
  );

  await withTraceAsync('rwa.init.daemons.initialize', async () => {
    await blockchainEventsDaemon.initialize();
    await evaluationResultsDaemon.initialize();
  });

  const plugin = withTraceSync('rwa.init.daemons.plugin', () =>
    new Elysia({ name: 'Daemons' })
      .use(clientsPlugin)
      .use(servicesPlugin)
      .use(orderedConsumerPlugin)
      .decorate('blockchainEventsDaemon', blockchainEventsDaemon)
      .decorate('evaluationResultsDaemon', evaluationResultsDaemon)
      .onStop(async () => {
        await withTraceAsync('rwa.stop.daemons', async () => {
          if (blockchainEventsDaemon) {
            await blockchainEventsDaemon.stop();
          }
          logger.info('Daemons stopped');
        });
      }),
  );

  return plugin;
};

export type DaemonsPlugin = Awaited<ReturnType<typeof createDaemonsPlugin>>;
