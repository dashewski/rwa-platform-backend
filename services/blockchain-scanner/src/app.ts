import { Elysia } from 'elysia';
import { monitoringPlugin } from '@shared/monitoring/src/monitoring.plugin';
import { healthPlugin } from '@shared/monitoring/src/health.plugin';
import { ErrorHandlerPlugin } from '@shared/errors/error-handler.plugin';
import { createOrderedPublisherPlugin } from '@shared/ordered-publisher';
import { createRepositoriesPlugin } from './plugins/repositories.plugin';
import { createServicesPlugin } from './plugins/services.plugin';
import { createControllersPlugin } from './plugins/controllers.plugin';
import { createDaemonsPlugin } from './plugins/daemons.plugin';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';

export async function createApp(
  port: number,
  mongoUri: string,
  rabbitMqUri: string,
  rpcUrl: string,
  contractAddress: string,
  blockConfirmations: number,
  scanIntervalMs: number,
  batchSize: number,
  chainId: number,
  initScanBlockNumber: number,
) {
  const repositoriesPlugin = await withTraceAsync(
    'blockchain-scanner.init.repositories_plugin',
    async () => await createRepositoriesPlugin(mongoUri),
  );

  // the publisher owns the RabbitMQ client, the exchange declaration and the outbox relay
  const orderedPublisherPlugin = await withTraceAsync(
    'blockchain-scanner.init.ordered_publisher_plugin',
    async () => await createOrderedPublisherPlugin(rabbitMqUri, 'blockchain.events'),
  );

  const servicesPlugin = withTraceSync('blockchain-scanner.init.services_plugin', () =>
    createServicesPlugin(repositoriesPlugin, orderedPublisherPlugin, chainId),
  );

  const controllersPlugin = withTraceSync('blockchain-scanner.init.controllers_plugin', () =>
    createControllersPlugin(servicesPlugin),
  );

  const daemonsPlugin = await withTraceAsync(
    'blockchain-scanner.init.daemons_plugin',
    async () =>
      await createDaemonsPlugin(
        servicesPlugin,
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
      .use(orderedPublisherPlugin)
      .use(servicesPlugin)
      .use(daemonsPlugin)
      .use(controllersPlugin);
  });

  return app;
}
