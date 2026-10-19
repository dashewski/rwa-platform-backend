import { Elysia } from 'elysia';
import mongoose from 'mongoose';
import { EvaluationRepository } from '../repositories/evaluation.repository';
import { EvaluationJobRepository } from '../repositories/evaluationJob.repository';
import { InboxConsumerMessageRepository } from '@shared/inbox-consumer';
import { OutboxPublisherMessageRepository } from '@shared/outbox-publisher';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';

export const createRepositoriesPlugin = async (mongoUri: string) => {
  const evaluationRepository = withTraceSync(
    'ai-evaluator.init.repositories.evaluation',
    () => new EvaluationRepository(),
  );

  const evaluationJobRepository = withTraceSync(
    'ai-evaluator.init.repositories.evaluation_job',
    () => new EvaluationJobRepository(),
  );

  const inboxConsumerMessageRepository = withTraceSync(
    'ai-evaluator.init.repositories.inbox_consumer_message',
    () => new InboxConsumerMessageRepository(),
  );

  const outboxPublisherMessageRepository = withTraceSync(
    'ai-evaluator.init.repositories.outbox_publisher_message',
    () => new OutboxPublisherMessageRepository(),
  );

  await withTraceAsync('ai-evaluator.init.repositories_plugin.mongoose', async (ctx) => {
    mongoose.connection.once('connected', () => {
      ctx.end();
    });
    await mongoose.connect(mongoUri);
  });

  const plugin = withTraceSync('ai-evaluator.init.repositories.plugin', () =>
    new Elysia({ name: 'Repositories' })
      .decorate('evaluationRepository', evaluationRepository)
      .decorate('evaluationJobRepository', evaluationJobRepository)
      .decorate('inboxConsumerMessageRepository', inboxConsumerMessageRepository)
      .decorate('outboxPublisherMessageRepository', outboxPublisherMessageRepository)
      .onStop(async () => {
      await withTraceAsync('ai-evaluator.stop.repositories_plugin', async () => {
        await mongoose.disconnect();
      });
    }),
  );

  return plugin;
};

export type RepositoriesPlugin = Awaited<ReturnType<typeof createRepositoriesPlugin>>;
