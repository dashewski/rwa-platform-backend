import { AppError } from '@shared/errors/app-errors';
import type { BaseJobQueueClient } from '../clients/baseJobQueue.client';

export class JobQueueService {
  constructor(private readonly client: BaseJobQueueClient) {}

  async start(queue: string, jobId: string, state: Record<string, any>) {
    const jobQueue = this.client.getQueue(queue);

    if (await jobQueue.getJob(jobId)) {
      throw new AppError({ message: 'The job is already in progress', statusCode: 409, code: 'JOB_IN_PROGRESS' });
    }

    await jobQueue.add(queue, { index: 0, state }, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: true,
      removeOnFail: { age: 86_400 },
    });
  }
}
