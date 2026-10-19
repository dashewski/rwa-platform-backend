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
  providerUrl: string,
  walletPrivateKey: string,
  holdTokenAddress: string,
  platformTokenAddress: string,
  gasTokenAmount: number,
  holdTokenAmount: number,
  platformTokenAmount: number,
  requestGasDelay: number,
  requestHoldDelay: number,
  requestPlatformDelay: number,
) {
  const repositoriesPlugin = await withTraceAsync(
    'testnet-faucet.init.repositories_plugin',
    async () => await createRepositoriesPlugin(mongoUri),
  );

  const clientsPlugin = await withTraceAsync(
    'testnet-faucet.init.clients_plugin',
    async () => await createClientsPlugin(providerUrl, walletPrivateKey),
  );

  const servicesPlugin = withTraceSync('testnet-faucet.init.services_plugin', () =>
    createServicesPlugin(
      repositoriesPlugin,
      clientsPlugin,
      holdTokenAddress,
      platformTokenAddress,
      gasTokenAmount,
      holdTokenAmount,
      platformTokenAmount,
      requestGasDelay,
      requestHoldDelay,
      requestPlatformDelay,
    ),
  );

  const controllersPlugin = withTraceSync('testnet-faucet.init.controllers_plugin', () =>
    createControllersPlugin(servicesPlugin),
  );

  const app = withTraceSync('testnet-faucet.init.elysia', () => {
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
