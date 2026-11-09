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
  openRouterApiKey: string,
  openRouterBaseUrl: string,
  openRouterModel: string,
  rwaServiceUrl: string,
  documentsServiceUrl: string,
  galleryServiceUrl: string,
  reactionsServiceUrl: string,
  questionsServiceUrl: string,
  portfolioServiceUrl: string,
  rabbitMqUri: string,
  maxFilesPerRequest: number,
) {
  const repositoriesPlugin = await withTraceAsync(
    'ai-evaluator.init.repositories_plugin',
    async () => await createRepositoriesPlugin(mongoUri),
  );

  const clientsPlugin = await createClientsPlugin(
    openRouterApiKey,
    openRouterBaseUrl,
    rwaServiceUrl,
    documentsServiceUrl,
    galleryServiceUrl,
    reactionsServiceUrl,
    questionsServiceUrl,
    portfolioServiceUrl,
    rabbitMqUri,
  );

  const servicesPlugin = withTraceSync('ai-evaluator.init.services_plugin', () =>
    createServicesPlugin(repositoriesPlugin, clientsPlugin, openRouterModel, maxFilesPerRequest),
  );

  const controllersPlugin = withTraceSync('ai-evaluator.init.controllers_plugin', () =>
    createControllersPlugin(servicesPlugin),
  );

  const daemonsPlugin = await withTraceAsync(
    'ai-evaluator.init.daemons_plugin',
    async () => await createDaemonsPlugin(clientsPlugin, servicesPlugin),
  );

  const app = withTraceSync('ai-evaluator.init.elysia', () => {
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
