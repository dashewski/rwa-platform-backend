import { logger } from '@shared/monitoring/src/monitoring.plugin';
import type { Worker } from 'bullmq';
import type { BaseJobQueueClient } from '../clients/baseJobQueue.client';

export abstract class BaseJobQueueDaemon {
  private readonly workers: Worker[] = [];

  constructor(private readonly client: BaseJobQueueClient) {}

  protected abstract getTasks(): Record<string, Array<(state: Record<string, any>) => Promise<Record<string, any>>>>;

  async initialize() {
    for (const [queue, steps] of Object.entries(this.getTasks())) {
      const worker = this.client.createWorker(queue, async (job) => {
        const state = { ...job.data.state, ...(await steps[job.data.index](job.data.state)) };
        const nextIndex = job.data.index + 1;

        if (!steps[nextIndex]) {
          return;
        }

        await this.client.getQueue(queue).add(queue, { index: nextIndex, state }, {
          jobId: `${state.evaluationId}-${nextIndex}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: true,
          removeOnFail: { age: 86_400 },
        });
      });

      worker.on('failed', (job, error) => logger.error(`Job ${job?.id ?? '-'} failed: ${error.message}`));

      this.workers.push(worker);
    }
  }

  async stop() {
    await Promise.all(this.workers.map((worker) => worker.close()));
  }
}
