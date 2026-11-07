import { Elysia } from 'elysia';
import { FaucetService } from '../services/faucet.service';
import type { RepositoriesPlugin } from './repositories.plugin';
import type { ClientsPlugin } from './clients.plugin';
import { withTraceSync } from '@shared/monitoring/src/tracing';

export const createServicesPlugin = (
  repositoriesPlugin: RepositoriesPlugin,
  clientsPlugin: ClientsPlugin,
  holdTokenAddress: string,
  platformTokenAddress: string,
  gasTokenAmount: number,
  holdTokenAmount: number,
  platformTokenAmount: number,
  requestGasDelaySec: number,
  requestHoldDelaySec: number,
  requestPlatformDelaySec: number,
) => {
  const faucetService = withTraceSync(
    'testnet-faucet.init.services.faucet',
    () =>
      new FaucetService(
        repositoriesPlugin.decorator.faucetRequestRepository,
        repositoriesPlugin.decorator.faucetCooldownRepository,
        clientsPlugin.decorator.blockchainClient,
        holdTokenAddress,
        platformTokenAddress,
        gasTokenAmount,
        holdTokenAmount,
        platformTokenAmount,
        requestGasDelaySec,
        requestHoldDelaySec,
        requestPlatformDelaySec,
      ),
  );

  const plugin = withTraceSync('testnet-faucet.init.services.plugin', () =>
    new Elysia({ name: 'Services' })
      .use(repositoriesPlugin)
      .use(clientsPlugin)
      .decorate('faucetService', faucetService),
  );

  return plugin;
};

export type ServicesPlugin = ReturnType<typeof createServicesPlugin>;
