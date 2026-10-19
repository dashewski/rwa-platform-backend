import { Elysia } from 'elysia';
import mongoose from 'mongoose';
import { TokenBalanceRepository } from '../repositories/tokenBalance.repository';
import { TransactionRepository } from '../repositories/transaction.repository';
import { InboxConsumerMessageRepository } from '@shared/inbox-consumer';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';

export const createRepositoriesPlugin = async (mongoUri: string) => {
  const tokenBalanceRepository = withTraceSync(
    'portfolio.init.repositories.tokenBalance',
    () => new TokenBalanceRepository(),
  );

  const transactionRepository = withTraceSync(
    'portfolio.init.repositories.transaction',
    () => new TransactionRepository(),
  );

  const inboxConsumerMessageRepository = withTraceSync(
    'portfolio.init.repositories.inbox_consumer_message',
    () => new InboxConsumerMessageRepository(),
  );

  await withTraceAsync('portfolio.init.repositories_plugin.mongoose', async (ctx) => {
    mongoose.connection.once('connected', () => {
      ctx.end();
    });
    await mongoose.connect(mongoUri);
  });

  const plugin = withTraceSync('portfolio.init.repositories.plugin', () =>
    new Elysia({ name: 'Repositories' })
      .decorate('tokenBalanceRepository', tokenBalanceRepository)
      .decorate('transactionRepository', transactionRepository)
      .decorate('inboxConsumerMessageRepository', inboxConsumerMessageRepository)
      .onStop(async () => {
        await withTraceAsync('portfolio.stop.repositories_plugin', async () => {
          await mongoose.disconnect();
        });
      }),
  );

  return plugin;
};

export type RepositoriesPlugin = Awaited<ReturnType<typeof createRepositoriesPlugin>>;
