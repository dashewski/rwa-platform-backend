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
  rpcUrl: string,
  contractAddress: string,
  blockConfirmations: number,
  scanIntervalMs: number,
  batchSize: number,
  chainId: string,
  initScanBlockNumber: number,
) {
  const repositoriesPlugin = await withTraceAsync(
    'blockchain-scanner.init.repositories_plugin',
    async () => await createRepositoriesPlugin(mongoUri),
  );

  const clientsPlugin = await withTraceAsync(
    'blockchain-scanner.init.clients_plugin',
    async () => await createClientsPlugin(rabbitMqUri),
  );

  const servicesPlugin = withTraceSync('blockchain-scanner.init.services_plugin', () =>
    createServicesPlugin(repositoriesPlugin, clientsPlugin, chainId),
  );

  const controllersPlugin = withTraceSync('blockchain-scanner.init.controllers_plugin', () =>
    createControllersPlugin(servicesPlugin),
  );

  const daemonsPlugin = await withTraceAsync(
    'blockchain-scanner.init.daemons_plugin',
    async () =>
      await createDaemonsPlugin(
        servicesPlugin,
        clientsPlugin,
        rpcUrl,
        contractAddress,
        blockConfirmations,
        scanIntervalMs,
        batchSize,
        chainId,
        initScanBlockNumber,
      ),
  );

  const app = withTraceSync('blockchain-scanner.init.elysia', () => {
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
