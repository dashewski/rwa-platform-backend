import { Elysia } from 'elysia';
import mongoose from 'mongoose';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { FeesRepository } from '../repositories/fees.repository';
import { ReferralRepository } from '../repositories/referral.repository';
import { ReferrerClaimHistoryRepository } from '../repositories/referrerClaimHistory.repository';
import { CommissionHistoryRepository } from '../repositories/commissionHistory.repository';
import { ReferrerWithdrawRepository } from '../repositories/referrerWithdraw.repository';
import { InboxConsumerMessageRepository } from '@shared/inbox-consumer';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';

export const createRepositoriesPlugin = async (mongoUri: string) => {
  const feesRepository = withTraceSync('loyalty.init.repositories.fees', () => new FeesRepository());

  const referralRepository = withTraceSync('loyalty.init.repositories.referral', () => new ReferralRepository());

  const referrerClaimHistoryRepository = withTraceSync(
    'loyalty.init.repositories.referrer_claim_history',
    () => new ReferrerClaimHistoryRepository(),
  );

  const commissionHistoryRepository = withTraceSync(
    'loyalty.init.repositories.commission_history',
    () => new CommissionHistoryRepository(),
  );

  const referrerWithdrawRepository = withTraceSync(
    'loyalty.init.repositories.referrer_withdraw',
    () => new ReferrerWithdrawRepository(),
  );

  const inboxConsumerMessageRepository = withTraceSync(
    'loyalty.init.repositories.inbox_consumer_message',
    () => new InboxConsumerMessageRepository(),
  );

  await withTraceAsync('loyalty.init.repositories_plugin.mongoose', async (ctx) => {
    logger.info('Connecting to MongoDB', { uri: mongoUri });
    mongoose.connection.once('connected', () => {
      logger.info('MongoDB connected successfully');
      ctx.end();
    });
    await mongoose.connect(mongoUri);
  });

  const plugin = withTraceSync('loyalty.init.repositories.plugin', () =>
    new Elysia({ name: 'Repositories' })
      .decorate('feesRepository', feesRepository)
      .decorate('referralRepository', referralRepository)
      .decorate('referrerClaimHistoryRepository', referrerClaimHistoryRepository)
      .decorate('commissionHistoryRepository', commissionHistoryRepository)
      .decorate('referrerWithdrawRepository', referrerWithdrawRepository)
      .decorate('inboxConsumerMessageRepository', inboxConsumerMessageRepository)
      .onStop(async () => {
        await withTraceAsync('loyalty.stop.repositories_plugin', async () => {
          logger.info('Disconnecting from MongoDB');
          await mongoose.disconnect();
          logger.info('MongoDB disconnected successfully');
        });
      }),
  );

  return plugin;
};

export type RepositoriesPlugin = Awaited<ReturnType<typeof createRepositoriesPlugin>>;
