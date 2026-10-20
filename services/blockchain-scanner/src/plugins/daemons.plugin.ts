import { Elysia } from 'elysia';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { OutboxPublisherDaemon } from '../daemons/outboxPublisher.daemon';
import { BlockchainScannerDaemon } from '../daemons/blockchainScanner.daemon';
import type { ServicesPlugin } from './services.plugin';
import type { ClientsPlugin } from './clients.plugin';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';

export const createDaemonsPlugin = async (
  servicesPlugin: ServicesPlugin,
  clientsPlugin: ClientsPlugin,
  rpcUrl: string,
  contractAddress: string,
  blockConfirmations: number,
  scanIntervalMs: number,
  batchSize: number,
  chainId: string,
  initScanBlockNumber: number,
) => {
  const outboxPublisherDaemon = withTraceSync(
    'blockchain-scanner.init.daemons.outbox_publisher',
    () => new OutboxPublisherDaemon(servicesPlugin.decorator.outboxPublisherService),
  );

  const blockchainScanner = withTraceSync(
    'blockchain-scanner.init.daemons.blockchain_scanner',
    () =>
      new BlockchainScannerDaemon(
        rpcUrl,
        contractAddress,
        blockConfirmations,
        scanIntervalMs,
        batchSize,
        chainId,
        initScanBlockNumber,
        servicesPlugin.decorator.blockchainScannerService,
      ),
  );

  await withTraceAsync('blockchain-scanner.init.daemons.initialize', async () => {
    logger.info('Initializing ordered publisher daemon');
    await outboxPublisherDaemon.initialize();
    logger.info('Initializing blockchain scanner');
    await blockchainScanner.initialize();
    blockchainScanner.start().catch((err) => {
      logger.error(`Failed to start blockchain scanner: ${err.message}`);
    });
    logger.info('Blockchain scanner startup initiated');
  });

  const plugin = withTraceSync('blockchain-scanner.init.daemons.plugin', () =>
    new Elysia({ name: 'Daemons' })
      .use(clientsPlugin)
      .use(servicesPlugin)
      .decorate('outboxPublisherDaemon', outboxPublisherDaemon)
      .decorate('blockchainScanner', blockchainScanner)
      .onStop(async () => {
        await withTraceAsync('blockchain-scanner.stop.daemons', async () => {
          logger.info('Stopping blockchain scanner');
          await blockchainScanner.stop();
          outboxPublisherDaemon.stop();
          logger.info('Blockchain scanner stopped successfully');
        });
      }),
  );

  return plugin;
};

export type DaemonsPlugin = Awaited<ReturnType<typeof createDaemonsPlugin>>;
