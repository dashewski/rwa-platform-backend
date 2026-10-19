import { Elysia } from 'elysia';
import { monitoringPlugin } from '@shared/monitoring/src/monitoring.plugin';
import { healthPlugin } from '@shared/monitoring/src/health.plugin';
import { ErrorHandlerPlugin } from '@shared/errors/error-handler.plugin';
import { createRepositoriesPlugin } from './plugins/repositories.plugin';
import { createClientsPlugin } from './plugins/clients.plugin';
import { createServicesPlugin } from './plugins/services.plugin';
import { createControllersPlugin } from './plugins/controllers.plugin';
import { createDaemonsPlugin } from './plugins/daemons.plugin';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';

export async function createApp(
  mongoUri: string,
  rabbitMqUri: string,
  redisUrl: string,
  encryptionKey: string,
) {
  const repositoriesPlugin = await withTraceAsync(
    'webhooks.init.repositories_plugin',
    async () => await createRepositoriesPlugin(mongoUri),
  );

  const clientsPlugin = await createClientsPlugin(
    rabbitMqUri,
    redisUrl,
  );

  const servicesPlugin = withTraceSync('webhooks.init.services_plugin', () =>
    createServicesPlugin(repositoriesPlugin, clientsPlugin, encryptionKey),
  );

  const controllersPlugin = withTraceSync('webhooks.init.controllers_plugin', () =>
    createControllersPlugin(servicesPlugin),
  );

  const daemonsPlugin = await withTraceAsync(
    'webhooks.init.daemons_plugin',
    async () => await createDaemonsPlugin(clientsPlugin, servicesPlugin),
  );

  const app = withTraceSync('webhooks.init.elysia', () => {
    return new Elysia()
      .use(monitoringPlugin)
      .use(healthPlugin)
      .onError(ErrorHandlerPlugin)
      .use(repositoriesPlugin)
      .use(clientsPlugin)
      .use(servicesPlugin)
      .use(daemonsPlugin)
      .use(controllersPlugin);
  });

  return app;
}
