import { Elysia } from 'elysia';
import mongoose from 'mongoose';
import { EvaluationRepository } from '../repositories/evaluation.repository';
import { EvaluationLockRepository } from '../repositories/evaluationLock.repository';
import { InboxConsumerMessageRepository } from '@shared/inbox-consumer';
import { OutboxPublisherMessageRepository } from '@shared/outbox-publisher';
import { withTraceSync, withTraceAsync } from '@shared/monitoring/src/tracing';

export const createRepositoriesPlugin = async (mongoUri: string) => {
  const evaluationRepository = withTraceSync(
    'ai-evaluator.init.repositories.evaluation',
    () => new EvaluationRepository(),
  );

  const evaluationLockRepository = withTraceSync(
    'ai-evaluator.init.repositories.evaluation_lock',
    () => new EvaluationLockRepository(),
  );

  const outboxPublisherMessageRepository = withTraceSync(
    'ai-evaluator.init.repositories.outbox_publisher_message',
    () => new OutboxPublisherMessageRepository(),
  );

  const inboxConsumerMessageRepository = withTraceSync(
    'ai-evaluator.init.repositories.inbox_consumer_message',
    () => new InboxConsumerMessageRepository(),
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
      .decorate('evaluationLockRepository', evaluationLockRepository)
      .decorate('outboxPublisherMessageRepository', outboxPublisherMessageRepository)
      .decorate('inboxConsumerMessageRepository', inboxConsumerMessageRepository)
      .onStop(async () => {
        await withTraceAsync('ai-evaluator.stop.repositories_plugin', async () => {
          await mongoose.disconnect();
        });
      }),
  );

  return plugin;
};

export type RepositoriesPlugin = Awaited<ReturnType<typeof createRepositoriesPlugin>>;
