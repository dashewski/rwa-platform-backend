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
  signersManagerUrl: string,
  referralRewardPercentage: number,
  supportedNetworks: any[],
) {
  const repositoriesPlugin = await withTraceAsync(
    'loyalty.init.repositories_plugin',
    async () => await createRepositoriesPlugin(mongoUri),
  );

  const clientsPlugin = await withTraceAsync(
    'loyalty.init.clients_plugin',
    async () => await createClientsPlugin(signersManagerUrl, rabbitMqUri),
  );

  const servicesPlugin = withTraceSync('loyalty.init.services_plugin', () =>
    createServicesPlugin(repositoriesPlugin, clientsPlugin, referralRewardPercentage, supportedNetworks),
  );

  const controllersPlugin = withTraceSync('loyalty.init.controllers_plugin', () =>
    createControllersPlugin(servicesPlugin),
  );

  const daemonsPlugin = await withTraceAsync(
    'loyalty.init.daemons_plugin',
    async () => await createDaemonsPlugin(servicesPlugin, clientsPlugin),
  );

  const app = withTraceSync('loyalty.init.elysia', () => {
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
