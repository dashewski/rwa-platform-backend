/**
 * Unit tests for EvaluationJobDaemon — the 500 ms poller that drains the
 * durable evaluation job queue.
 *
 * The service is a fake: the tests only care about the schedule, the
 * concurrency argument and that one failed pass does not kill the loop.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { EvaluationJobDaemon } from '../src/daemons/evaluationJob.daemon';
import type { RiskEvaluationService } from '../src/services/riskEvaluation.service';

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createFakeService() {
  const state = { passes: 0 };

  return {
    state,

    processEvaluationJobs: mock(async (_concurrency: number) => {
      state.passes += 1;
    }),
  };
}

describe('EvaluationJobDaemon', () => {
  let service: ReturnType<typeof createFakeService>;
  let daemon: EvaluationJobDaemon;

  beforeEach(() => {
    service = createFakeService();
    daemon = new EvaluationJobDaemon(service as unknown as RiskEvaluationService, 10, 5);
  });

  afterEach(async () => {
    await daemon.stop();
  });

  test('initialize: starts polling and passes the configured concurrency', async () => {
    daemon.initialize();
    await wait(35);

    expect(service.state.passes).toBeGreaterThanOrEqual(2);
    expect(service.processEvaluationJobs).toHaveBeenCalledWith(5);
  });

  test('stop: no further passes are started', async () => {
    daemon.initialize();
    await wait(15);
    daemon.stop();

    const passesAtStop = service.state.passes;
    await wait(40);

    expect(service.state.passes).toBe(passesAtStop);
  });

  test('stop before initialize is a no-op', async () => {
    await daemon.stop();
    await wait(20);

    expect(service.state.passes).toBe(0);
  });

  test('a failing pass is swallowed and the next tick is still scheduled', async () => {
    service.processEvaluationJobs.mockImplementationOnce(async () => {
      throw new Error('mongo is down');
    });

    daemon.initialize();
    await wait(60);

    expect(service.state.passes).toBeGreaterThanOrEqual(1);
  });

  test('a pass is not overlapped by the next one', async () => {
    let running = 0;
    let maxRunning = 0;

    service.processEvaluationJobs.mockImplementation(async () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await wait(20);
      running -= 1;
      service.state.passes += 1;
    });

    daemon.initialize();
    await wait(70);

    expect(maxRunning).toBe(1);
  });
});
