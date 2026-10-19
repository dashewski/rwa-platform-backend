import { Elysia } from 'elysia';
import mongoose from 'mongoose';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { SignatureRepository } from '../repositories/signature.repository';
import { SignatureTaskRepository } from '../repositories/signatureTask.repository';
import { InboxConsumerMessageRepository } from '@shared/inbox-consumer';
import { OutboxPublisherMessageRepository } from '@shared/outbox-publisher';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';

export const createRepositoriesPlugin = async (mongoUri: string) => {
  const signatureRepository = withTraceSync(
    'signers-manager.init.repositories.signature',
    () => new SignatureRepository(),
  );

  const signatureTaskRepository = withTraceSync(
    'signers-manager.init.repositories.signature_task',
    () => new SignatureTaskRepository(),
  );

  const inboxConsumerMessageRepository = withTraceSync(
    'signers-manager.init.repositories.inbox_consumer_message',
    () => new InboxConsumerMessageRepository(),
  );

  const outboxPublisherMessageRepository = withTraceSync(
    'signers-manager.init.repositories.outbox_publisher_message',
    () => new OutboxPublisherMessageRepository(),
  );

  await withTraceAsync('signers-manager.init.repositories_plugin.mongoose', async (ctx) => {
    logger.info('Connecting to MongoDB', { uri: mongoUri });
    mongoose.connection.once('connected', () => {
      logger.info('MongoDB connected successfully');
      ctx.end();
    });
    await mongoose.connect(mongoUri);
  });

  const plugin = withTraceSync('signers-manager.init.repositories.plugin', () =>
    new Elysia({ name: 'Repositories' })
      .decorate('signatureRepository', signatureRepository)
      .decorate('signatureTaskRepository', signatureTaskRepository)
      .decorate('inboxConsumerMessageRepository', inboxConsumerMessageRepository)
      .decorate('outboxPublisherMessageRepository', outboxPublisherMessageRepository)
      .onStop(async () => {
        await withTraceAsync('signers-manager.stop.repositories_plugin', async () => {
          logger.info('Disconnecting from MongoDB');
          await mongoose.disconnect();
          logger.info('MongoDB disconnected successfully');
        });
      }),
  );

  return plugin;
};

export type RepositoriesPlugin = Awaited<ReturnType<typeof createRepositoriesPlugin>>;
