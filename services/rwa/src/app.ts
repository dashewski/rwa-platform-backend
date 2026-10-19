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
  redisUrl: string,
  serviceName: string,
  openRouterApiKey: string,
  openRouterBaseUrl: string,
  openRouterModel: string,
  rabbitMqUri: string,
  signersManagerUrl: string,
  aiEvaluatorUrl: string,
  supportedNetworks: any[],
  placeholderImageUrl: string,
  filesBaseUrl: string,
) {
  const repositoriesPlugin = await withTraceAsync(
    'rwa.init.repositories_plugin',
    async () => await createRepositoriesPlugin(mongoUri),
  );

  const clientsPlugin = await withTraceAsync(
    'rwa.init.clients_plugin',
    async () =>
      await createClientsPlugin(
        redisUrl,
        serviceName,
        openRouterApiKey,
        openRouterBaseUrl,
        rabbitMqUri,
        signersManagerUrl,
        aiEvaluatorUrl,
      ),
  );

  const servicesPlugin = withTraceSync('rwa.init.services_plugin', () =>
    createServicesPlugin(
      repositoriesPlugin,
      clientsPlugin,
      supportedNetworks,
      openRouterModel,
      placeholderImageUrl,
      filesBaseUrl,
    ),
  );

  const controllersPlugin = withTraceSync('rwa.init.controllers_plugin', () => createControllersPlugin(servicesPlugin));

  const daemonsPlugin = await withTraceAsync(
    'rwa.init.daemons_plugin',
    async () => await createDaemonsPlugin(servicesPlugin, clientsPlugin),
  );

  const app = withTraceSync('rwa.init.elysia', () => {
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
