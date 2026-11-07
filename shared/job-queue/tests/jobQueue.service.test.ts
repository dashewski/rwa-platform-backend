import { describe, expect, mock, test } from 'bun:test';
import { JobQueueService } from '../src/services/jobQueue.service';

function setup() {
  const jobs = new Map<string, any>();

  const queue = {
    getJob: mock(async (id: string) => jobs.get(id)),
    add: mock(async (name: string, data: any, options: any) => {
      jobs.set(options.jobId, { id: options.jobId, data, options });
      return jobs.get(options.jobId);
    }),
  };

  const client = { getQueue: () => queue };
  const service = new JobQueueService(client as never);

  return { jobs, queue, service };
}

describe('JobQueueService.start', () => {
  test('queues the first step with the given state', async () => {
    const { jobs, service } = setup();

    await service.start('evaluation', 'evaluation-business-b1', { entityId: 'b1', evaluationId: 'evaluation-1' });

    const job = jobs.get('evaluation-business-b1');

    expect(job.data).toEqual({ index: 0, state: { entityId: 'b1', evaluationId: 'evaluation-1' } });
    expect(job.options.attempts).toBe(3);
  });

  test('rejects a second job for the same key', async () => {
    const { service } = setup();

    await service.start('evaluation', 'evaluation-business-b1', { evaluationId: 'evaluation-1' });

    await expect(service.start('evaluation', 'evaluation-business-b1', { evaluationId: 'evaluation-2' })).rejects.toThrow(
      'The job is already in progress',
    );
  });
});
