import { Elysia } from 'elysia';
import mongoose from 'mongoose';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { OutboxPublisherMessageRepository } from '@shared/outbox-publisher';
import { EventRepository } from '../repositories/event.repository';
import { ScannerStateRepository } from '../repositories/scannerState.repository';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';

export const createRepositoriesPlugin = async (mongoUri: string) => {
  const eventRepository = withTraceSync('blockchain-scanner.init.repositories.event', () => new EventRepository());

  const scannerStateRepository = withTraceSync(
    'blockchain-scanner.init.repositories.scanner_state',
    () => new ScannerStateRepository(),
  );

  const outboxPublisherMessageRepository = withTraceSync(
    'blockchain-scanner.init.repositories.outbox_publisher_message',
    () => new OutboxPublisherMessageRepository(),
  );

  await withTraceAsync('blockchain-scanner.init.repositories_plugin.mongoose', async (ctx) => {
    logger.info('Connecting to MongoDB', { uri: mongoUri });
    mongoose.connection.once('connected', () => {
      logger.info('MongoDB connected successfully');
      ctx.end();
    });
    await mongoose.connect(mongoUri);
  });

  const plugin = withTraceSync('blockchain-scanner.init.repositories.plugin', () =>
    new Elysia({ name: 'Repositories' })
      .decorate('eventRepository', eventRepository)
      .decorate('scannerStateRepository', scannerStateRepository)
      .decorate('outboxPublisherMessageRepository', outboxPublisherMessageRepository)
      .onStop(async () => {
        await withTraceAsync('blockchain-scanner.stop.repositories_plugin', async () => {
          logger.info('Disconnecting from MongoDB');
          await mongoose.disconnect();
          logger.info('MongoDB disconnected successfully');
        });
      }),
  );

  return plugin;
};

export type RepositoriesPlugin = Awaited<ReturnType<typeof createRepositoriesPlugin>>;
