import { describe, expect, mock, test } from 'bun:test';
import { BaseJobQueueDaemon } from '../src/daemons/baseJobQueue.daemon';

function setup(steps: Array<(state: Record<string, any>) => Promise<Record<string, any>>>) {
  const jobs = new Map<string, any>();
  const processors = new Map<string, any>();

  const queue = {
    add: mock(async (name: string, data: any, options: any) => {
      jobs.set(options.jobId, { data, options });
      return jobs.get(options.jobId);
    }),
    getJob: mock(async (id: string) => jobs.get(id)),
  };

  const client = {
    getQueue: () => queue,
    createWorker: (name: string, processor: any) => {
      processors.set(name, processor);
      return { on: mock(() => {}), close: mock(async () => {}) };
    },
  };

  class Daemon extends BaseJobQueueDaemon {
    protected getTasks() {
      return { evaluation: steps };
    }
  }

  return { daemon: new Daemon(client as never), processors, jobs };
}

describe('BaseJobQueueDaemon', () => {
  test('runs the current step and queues the next one with the merged state', async () => {
    const { daemon, processors, jobs } = setup([
      async (state) => ({ context: `ctx-${state.entityId}` }),
      async (state) => ({ summary: `sum-${state.context}` }),
    ]);

    await daemon.initialize();
    await processors.get('evaluation')({ data: { index: 0, state: { entityId: 'b1', evaluationId: 'e1' } } });

    expect(jobs.get('e1-1').data).toEqual({
      index: 1,
      state: { entityId: 'b1', evaluationId: 'e1', context: 'ctx-b1' },
    });
  });

  test('does not queue anything after the last step', async () => {
    const { daemon, processors, jobs } = setup([async () => ({ risk: { score: 10 } })]);

    await daemon.initialize();
    await processors.get('evaluation')({ data: { index: 0, state: { evaluationId: 'e1' } } });

    expect(jobs.size).toBe(0);
  });

  test('does not queue the next step when the current one fails', async () => {
    const { daemon, processors, jobs } = setup([
      async () => {
        throw new Error('boom');
      },
      async () => ({}),
    ]);

    await daemon.initialize();

    await expect(
      processors.get('evaluation')({ data: { index: 0, state: { evaluationId: 'e1' } } }),
    ).rejects.toThrow('boom');
    expect(jobs.size).toBe(0);
  });
});
