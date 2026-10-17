import { Elysia } from 'elysia';
import { BlockchainScannerService } from '../services/blockchainScanner.service';
import type { RepositoriesPlugin } from './repositories.plugin';
import type { OrderedPublisherPlugin } from '@shared/ordered-publisher';
import { withTraceSync } from '@shared/monitoring/src/tracing';

export const createServicesPlugin = (
  repositoriesPlugin: RepositoriesPlugin,
  orderedPublisherPlugin: OrderedPublisherPlugin,
  chainId: number,
) => {
  const blockchainScannerService = withTraceSync(
    'blockchain-scanner.init.services.blockchain_scanner',
    () =>
      new BlockchainScannerService(
        repositoriesPlugin.decorator.eventRepository,
        repositoriesPlugin.decorator.scannerStateRepository,
        orderedPublisherPlugin.decorator.orderedPublisher,
        chainId,
      ),
  );

  const plugin = withTraceSync('blockchain-scanner.init.services.plugin', () =>
    new Elysia({ name: 'Services' })
      .use(repositoriesPlugin)
      .use(orderedPublisherPlugin)
      .decorate('blockchainScannerService', blockchainScannerService),
  );

  return plugin;
};

export type ServicesPlugin = ReturnType<typeof createServicesPlugin>;
