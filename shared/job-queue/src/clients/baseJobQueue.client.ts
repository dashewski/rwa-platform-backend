import { Queue, Worker } from 'bullmq';
import type { Job } from 'bullmq';
import { AppError } from '@shared/errors/app-errors';

export abstract class BaseJobQueueClient {
  private readonly queues = new Map<string, Queue>();

  constructor(
    public readonly redisUrl: string,
    public readonly serviceName: string,
  ) {}

  abstract getTopologyDefinition(): { queues: Record<string, { concurrency: number }> };

  async initialize() {
    for (const name of Object.keys(this.getTopologyDefinition().queues)) {
      this.queues.set(name, new Queue(name, { connection: { url: this.redisUrl, maxRetriesPerRequest: null } }));
    }
  }

  getQueue(name: string) {
    const queue = this.queues.get(name);

    if (!queue) {
      throw new AppError({ message: `Queue ${name} is not defined in the topology`, statusCode: 500, code: 'QUEUE_NOT_FOUND' });
    }

    return queue;
  }

  createWorker(name: string, processor: (job: Job) => Promise<void>) {
    const topology = this.getTopologyDefinition().queues[name];

    if (!topology) {
      throw new AppError({ message: `Queue ${name} is not defined in the topology`, statusCode: 500, code: 'QUEUE_NOT_FOUND' });
    }

    return new Worker(name, processor, {
      connection: { url: this.redisUrl, maxRetriesPerRequest: null },
      concurrency: topology.concurrency,
    });
  }

  async disconnect() {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    this.queues.clear();
  }
}
