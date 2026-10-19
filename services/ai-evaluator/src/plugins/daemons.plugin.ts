import { Elysia } from 'elysia';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { OutboxPublisherDaemon } from '../daemons/outboxPublisher.daemon';
import { EvaluationJobDaemon } from '../daemons/evaluationJob.daemon';
import type { ClientsPlugin } from './clients.plugin';
import type { ServicesPlugin } from './services.plugin';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';

export const createDaemonsPlugin = async (
  clientsPlugin: ClientsPlugin,
  servicesPlugin: ServicesPlugin,
) => {
  const evaluationJobDaemon = withTraceSync('ai-evaluator.init.daemons.evaluation_job', () =>
    new EvaluationJobDaemon(servicesPlugin.decorator.riskEvaluationService, 500, 5),
  );

  const outboxPublisherDaemon = withTraceSync('ai-evaluator.init.daemons.outbox_publisher', () =>
    new OutboxPublisherDaemon(servicesPlugin.decorator.outboxPublisher),
  );

  await withTraceAsync('ai-evaluator.init.daemons.initialize', async () => {
    logger.debug('Initializing daemons');
    await outboxPublisherDaemon.initialize();
    evaluationJobDaemon.initialize();
    logger.info('Daemons initialized');
  });

  const plugin = withTraceSync('ai-evaluator.init.daemons.plugin', () =>
    new Elysia({ name: 'Daemons' })
      .use(clientsPlugin)
      .use(servicesPlugin)
      .decorate('outboxPublisherDaemon', outboxPublisherDaemon)
      .onStop(async () => {
        await withTraceAsync('ai-evaluator.stop.daemons_plugin', async () => {
          outboxPublisherDaemon.stop();
          evaluationJobDaemon.stop();
          logger.info('Daemons stopped');
        });
      }),
  );

  return plugin;
};

export type DaemonsPlugin = Awaited<ReturnType<typeof createDaemonsPlugin>>;
