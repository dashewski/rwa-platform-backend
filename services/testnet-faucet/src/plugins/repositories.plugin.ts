import { Elysia } from 'elysia';
import mongoose from 'mongoose';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { FaucetRequestRepository } from '../repositories/faucetRequest.repository';
import { FaucetCooldownRepository } from '../repositories/faucetCooldown.repository';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';

export const createRepositoriesPlugin = async (mongoUri: string) => {
  const faucetRequestRepository = withTraceSync(
    'testnet-faucet.init.repositories.faucet_request',
    () => new FaucetRequestRepository(),
  );

  const faucetCooldownRepository = withTraceSync(
    'testnet-faucet.init.repositories.faucet_cooldown',
    () => new FaucetCooldownRepository(),
  );

  await withTraceAsync('testnet-faucet.init.repositories_plugin.mongoose', async (ctx) => {
    logger.info('Connecting to MongoDB', { uri: mongoUri });
    mongoose.connection.once('connected', () => {
      logger.info('MongoDB connected successfully');
      ctx.end();
    });
    await mongoose.connect(mongoUri);
  });

  const plugin = withTraceSync('testnet-faucet.init.repositories.plugin', () =>
    new Elysia({ name: 'Repositories' })
      .decorate('faucetRequestRepository', faucetRequestRepository)
      .decorate('faucetCooldownRepository', faucetCooldownRepository)
      .onStop(async () => {
        await withTraceAsync('testnet-faucet.stop.repositories_plugin', async () => {
          logger.info('Disconnecting from MongoDB');
          await mongoose.disconnect();
          logger.info('MongoDB disconnected successfully');
        });
      }),
  );

  return plugin;
};

export type RepositoriesPlugin = Awaited<ReturnType<typeof createRepositoriesPlugin>>;
