import { Elysia } from 'elysia';
import { monitoringPlugin } from '@shared/monitoring/src/monitoring.plugin';
import { healthPlugin } from '@shared/monitoring/src/health.plugin';
import { ErrorHandlerPlugin } from '@shared/errors/error-handler.plugin';
import { createRepositoriesPlugin } from './plugins/repositories.plugin';
import { createClientsPlugin } from './plugins/clients.plugin';
import { createServicesPlugin } from './plugins/services.plugin';
import { createDaemonsPlugin } from './plugins/daemons.plugin';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';

export async function createApp(
  mongoUri: string,
  rabbitMqUri: string,
  signerName: string,
  privateKey: string,
) {
  const repositoriesPlugin = await withTraceAsync(
    'signer.init.repositories_plugin',
    async () => await createRepositoriesPlugin(mongoUri),
  );

  const clientsPlugin = await withTraceAsync(
    'signer.init.clients_plugin',
    async () => await createClientsPlugin(rabbitMqUri, signerName),
  );

  const servicesPlugin = withTraceSync('signer.init.services_plugin', () =>
    createServicesPlugin(repositoriesPlugin, clientsPlugin, privateKey),
  );

  const daemonsPlugin = await withTraceAsync(
    'signer.init.daemons_plugin',
    async () => await createDaemonsPlugin(servicesPlugin, clientsPlugin),
  );

  const app = withTraceSync('signer.init.elysia', () => {
    return new Elysia()
      .use(monitoringPlugin)
      .use(healthPlugin)
      .onError(ErrorHandlerPlugin)
      .use(repositoriesPlugin)
      .use(clientsPlugin)
      .use(servicesPlugin)
      .use(daemonsPlugin);
  });

  return app;
}
