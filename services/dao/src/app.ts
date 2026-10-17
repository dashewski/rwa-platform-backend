import { Elysia } from 'elysia';
import { monitoringPlugin } from '@shared/monitoring/src/monitoring.plugin';
import { healthPlugin } from '@shared/monitoring/src/health.plugin';
import { ErrorHandlerPlugin } from '@shared/errors/error-handler.plugin';
import { createOrderedConsumerPlugin } from '@shared/ordered-consumer';
import { createRepositoriesPlugin } from './plugins/repositories.plugin';
import { createServicesPlugin } from './plugins/services.plugin';
import { createControllersPlugin } from './plugins/controllers.plugin';
import { createDaemonsPlugin } from './plugins/daemons.plugin';
import { BLOCKCHAIN_EVENTS_EXCHANGE, BLOCKCHAIN_EVENTS_QUEUE } from './daemons/blockchainEvents.daemon';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';

export async function createApp(port: number, mongoUri: string, rabbitMqUri: string) {
  const repositoriesPlugin = await withTraceAsync(
    'dao.init.repositories_plugin',
    async () => await createRepositoriesPlugin(mongoUri),
  );

  const servicesPlugin = withTraceSync('dao.init.services_plugin', () => createServicesPlugin(repositoriesPlugin));

  const controllersPlugin = withTraceSync('dao.init.controllers_plugin', () => createControllersPlugin(servicesPlugin));

  const orderedConsumerPlugin = await withTraceAsync(
    'dao.init.ordered_consumer_plugin',
    async () => await createOrderedConsumerPlugin(rabbitMqUri, BLOCKCHAIN_EVENTS_EXCHANGE, BLOCKCHAIN_EVENTS_QUEUE),
  );

  const daemonsPlugin = await withTraceAsync(
    'dao.init.daemons_plugin',
    async () => await createDaemonsPlugin(servicesPlugin, orderedConsumerPlugin),
  );

  const app = withTraceSync('dao.init.elysia', () => {
    return new Elysia()
      .use(monitoringPlugin)
      .use(healthPlugin)
      .onError(ErrorHandlerPlugin)
      .use(repositoriesPlugin)
      .use(orderedConsumerPlugin)
      .use(servicesPlugin)
      .use(daemonsPlugin)
      .use(controllersPlugin);
  });

  return app;
}
