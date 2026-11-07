import { BaseJobQueueClient } from '@shared/job-queue/src/clients/baseJobQueue.client';

export class JobQueueClient extends BaseJobQueueClient {
  constructor(redisUrl: string) {
    super(redisUrl, 'ai-evaluator');
  }

  getEvaluationQueue() {
    return 'evaluation';
  }

  getTopologyDefinition() {
    return {
      queues: {
        [this.getEvaluationQueue()]: { concurrency: 5 },
      },
    };
  }
}
