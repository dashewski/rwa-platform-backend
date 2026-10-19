import { Elysia } from 'elysia';
import { monitoringPlugin } from '@shared/monitoring/src/monitoring.plugin';
import { healthPlugin } from '@shared/monitoring/src/health.plugin';
import { ErrorHandlerPlugin } from '@shared/errors/error-handler.plugin';
import { createRepositoriesPlugin } from './plugins/repositories.plugin';
import { createClientsPlugin } from './plugins/clients.plugin';
import { createServicesPlugin } from './plugins/services.plugin';
import { createControllersPlugin } from './plugins/controllers.plugin';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';

export async function createApp(
  mongoUri: string,
  openRouterApiKey: string,
  openRouterBaseUrl: string,
  openRouterModel: string,
  rwaServiceUrl: string,
  portfolioServiceUrl: string,
) {
  const repositoriesPlugin = await withTraceAsync(
    'ai-assistant.init.repositories_plugin',
    async () => await createRepositoriesPlugin(mongoUri),
  );

  const clientsPlugin = withTraceSync('ai-assistant.init.clients_plugin', () =>
    createClientsPlugin(openRouterApiKey, openRouterBaseUrl, rwaServiceUrl, portfolioServiceUrl),
  );

  const servicesPlugin = withTraceSync('ai-assistant.init.services_plugin', () =>
    createServicesPlugin(repositoriesPlugin, clientsPlugin, openRouterModel),
  );

  const controllersPlugin = withTraceSync('ai-assistant.init.controllers_plugin', () =>
    createControllersPlugin(servicesPlugin),
  );

  const app = withTraceSync('ai-assistant.init.elysia', () => {
    return new Elysia()
      .use(monitoringPlugin)
      .use(healthPlugin)
      .onError(ErrorHandlerPlugin)
      .use(repositoriesPlugin)
      .use(clientsPlugin)
      .use(servicesPlugin)
      .use(controllersPlugin);
  });

  return app;
}
