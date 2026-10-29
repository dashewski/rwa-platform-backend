import { Elysia } from 'elysia';
import { OutboxPublisherService } from '@shared/outbox-publisher';
import { BlockchainScannerService } from '../services/blockchainScanner.service';
import type { RepositoriesPlugin } from './repositories.plugin';
import type { ClientsPlugin } from './clients.plugin';
import { withTraceSync } from '@shared/monitoring/src/tracing';

export const createServicesPlugin = (
  repositoriesPlugin: RepositoriesPlugin,
  clientsPlugin: ClientsPlugin,
  chainId: string,
) => {
  const rabbitMQClient = clientsPlugin.decorator.rabbitMQClient;

  const outboxPublisherService = withTraceSync(
    'blockchain-scanner.init.services.outbox_publisher',
    () => new OutboxPublisherService(rabbitMQClient, repositoriesPlugin.decorator.outboxPublisherMessageRepository),
  );

  const blockchainScannerService = withTraceSync(
    'blockchain-scanner.init.services.blockchain_scanner',
    () =>
      new BlockchainScannerService(
        repositoriesPlugin.decorator.eventRepository,
        repositoriesPlugin.decorator.scannerStateRepository,
        outboxPublisherService,
        chainId,
      ),
  );

  const plugin = withTraceSync('blockchain-scanner.init.services.plugin', () =>
    new Elysia({ name: 'Services' })
      .use(repositoriesPlugin)
      .use(clientsPlugin)
      .decorate('outboxPublisherService', outboxPublisherService)
      .decorate('blockchainScannerService', blockchainScannerService),
  );

  return plugin;
};

export type ServicesPlugin = ReturnType<typeof createServicesPlugin>;
