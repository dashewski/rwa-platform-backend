import { Elysia } from 'elysia';
import mongoose from 'mongoose';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { BusinessRepository } from '../repositories/business.repository';
import { PoolRepository } from '../repositories/pool.repository';
import { InboxConsumerMessageRepository } from '@shared/inbox-consumer';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';

export const createRepositoriesPlugin = async (mongoUri: string) => {
  const businessRepository = withTraceSync('rwa.init.repositories.business', () => new BusinessRepository());

  const poolRepository = withTraceSync('rwa.init.repositories.pool', () => new PoolRepository());

  const inboxConsumerMessageRepository = withTraceSync(
    'rwa.init.repositories.inbox_consumer_message',
    () => new InboxConsumerMessageRepository(),
  );

  await withTraceAsync('rwa.init.repositories_plugin.mongoose', async (ctx) => {
    logger.info('Connecting to MongoDB', { uri: mongoUri });
    mongoose.connection.once('connected', () => {
      logger.info('MongoDB connected successfully');
      ctx.end();
    });
    await mongoose.connect(mongoUri);
  });

  const plugin = withTraceSync('rwa.init.repositories.plugin', () =>
    new Elysia({ name: 'Repositories' })
      .decorate('businessRepository', businessRepository)
      .decorate('poolRepository', poolRepository)
      .decorate('inboxConsumerMessageRepository', inboxConsumerMessageRepository)
      .onStop(async () => {
        await withTraceAsync('rwa.stop.repositories_plugin', async () => {
          logger.info('Disconnecting from MongoDB');
          await mongoose.disconnect();
          logger.info('MongoDB disconnected successfully');
        });
      }),
  );

  return plugin;
};

export type RepositoriesPlugin = Awaited<ReturnType<typeof createRepositoriesPlugin>>;
