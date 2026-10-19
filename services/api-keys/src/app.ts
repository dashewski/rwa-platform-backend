import { Elysia } from 'elysia';
import { monitoringPlugin } from '@shared/monitoring/src/monitoring.plugin';
import { healthPlugin } from '@shared/monitoring/src/health.plugin';
import { ErrorHandlerPlugin } from '@shared/errors/error-handler.plugin';
import { createRepositoriesPlugin } from './plugins/repositories.plugin';
import { createServicesPlugin } from './plugins/services.plugin';
import { createControllersPlugin } from './plugins/controllers.plugin';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';

export async function createApp(mongoUri: string) {
  const repositoriesPlugin = await withTraceAsync(
    'api-keys.init.repositories_plugin',
    async () => await createRepositoriesPlugin(mongoUri),
  );

  const servicesPlugin = withTraceSync('api-keys.init.services_plugin', () => createServicesPlugin(repositoriesPlugin));

  const controllersPlugin = withTraceSync('api-keys.init.controllers', () => createControllersPlugin(servicesPlugin));

  const app = withTraceSync('api-keys.init.elysia', () => {
    return new Elysia()
      .use(monitoringPlugin)
      .use(healthPlugin)
      .onError(ErrorHandlerPlugin)
      .use(repositoriesPlugin)
      .use(servicesPlugin)
      .use(controllersPlugin);
  });

  return app;
}
