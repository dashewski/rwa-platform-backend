import { Elysia } from 'elysia';
import mongoose from 'mongoose';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { PriceDataRepository } from '../repositories/priceData.repository';
import { PoolTransactionRepository } from '../repositories/poolTransaction.repository';
import { InboxConsumerMessageRepository } from '@shared/inbox-consumer';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';

export const createRepositoriesPlugin = async (mongoUri: string) => {
  const priceDataRepository = withTraceSync('charts.init.repositories.price_data', () => new PriceDataRepository());

  const poolTransactionRepository = withTraceSync(
    'charts.init.repositories.pool_transaction',
    () => new PoolTransactionRepository(),
  );

  const inboxConsumerMessageRepository = withTraceSync(
    'charts.init.repositories.inbox_consumer_message',
    () => new InboxConsumerMessageRepository(),
  );

  await withTraceAsync('charts.init.repositories_plugin.mongoose', async (ctx) => {
    logger.info('Connecting to MongoDB', { uri: mongoUri });
    mongoose.connection.once('connected', () => {
      logger.info('MongoDB connected successfully');
      ctx.end();
    });
    await mongoose.connect(mongoUri);
  });

  const plugin = withTraceSync('charts.init.repositories.plugin', () =>
    new Elysia({ name: 'Repositories' })
      .decorate('priceDataRepository', priceDataRepository)
      .decorate('poolTransactionRepository', poolTransactionRepository)
      .decorate('inboxConsumerMessageRepository', inboxConsumerMessageRepository)
      .onStop(async () => {
        await withTraceAsync('charts.stop.repositories_plugin', async () => {
          logger.info('Disconnecting from MongoDB');
          await mongoose.disconnect();
          logger.info('MongoDB disconnected successfully');
        });
      }),
  );

  return plugin;
};

export type RepositoriesPlugin = Awaited<ReturnType<typeof createRepositoriesPlugin>>;
