import { Elysia } from 'elysia';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { OutboxPublisherDaemon } from '../daemons/outboxPublisher.daemon';
import { JobQueueDaemon } from '../daemons/jobQueue.daemon';
import type { ClientsPlugin } from './clients.plugin';
import type { ServicesPlugin } from './services.plugin';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';

export const createDaemonsPlugin = async (clientsPlugin: ClientsPlugin, servicesPlugin: ServicesPlugin) => {
  const jobQueueDaemon = withTraceSync(
    'ai-evaluator.init.daemons.evaluation_job',
    () =>
      new JobQueueDaemon(
        clientsPlugin.decorator.jobQueueClient,
        servicesPlugin.decorator.evaluationService,
      ),
  );

  const outboxPublisherDaemon = withTraceSync(
    'ai-evaluator.init.daemons.outbox_publisher',
    () =>
      new OutboxPublisherDaemon(
        servicesPlugin.decorator.outboxPublisherService,
        clientsPlugin.decorator.rabbitMQClient,
      ),
  );

  await withTraceAsync('ai-evaluator.init.daemons.initialize', async () => {
    logger.debug('Initializing daemons');
    await outboxPublisherDaemon.initialize();
    await jobQueueDaemon.initialize();
    logger.info('Daemons initialized');
  });

  const plugin = withTraceSync('ai-evaluator.init.daemons.plugin', () =>
    new Elysia({ name: 'Daemons' })
      .use(clientsPlugin)
      .use(servicesPlugin)
      .decorate('outboxPublisherDaemon', outboxPublisherDaemon)
      .decorate('jobQueueDaemon', jobQueueDaemon)
      .onStop(async () => {
        await withTraceAsync('ai-evaluator.stop.daemons_plugin', async () => {
          await outboxPublisherDaemon.stop();
          await jobQueueDaemon.stop();
          logger.info('Daemons stopped');
        });
      }),
  );

  return plugin;
};

export type DaemonsPlugin = Awaited<ReturnType<typeof createDaemonsPlugin>>;
