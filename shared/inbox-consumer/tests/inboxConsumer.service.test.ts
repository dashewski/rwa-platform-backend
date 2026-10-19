/**
 * Unit tests for InboxConsumerService — the attempt / halt state machine.
 *
 * The inbox repository is a fake, so the transaction itself is not exercised
 * here (its own test file covers that). What is pinned down: how many attempts
 * a delivery gets, the backoff between them, what a duplicate does, when the
 * stream halts and what brings it back.
 */
import './setup';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { InboxConsumerService } from '../src/services/inboxConsumer.service';
import { metrics } from '@shared/monitoring/src/metrics';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import type { InboxConsumerMessageRepository } from '../src/repositories/inboxConsumerMessage.repository';
import { makeMessage, QUEUE } from './fakes';

type RunOnceOutcome = 'apply' | 'duplicate' | 'fail';

function createFakeRepository() {
  const state = {
    outcomes: [] as RunOnceOutcome[],
    calls: [] as Array<{ messageId: string; handlerCalled: boolean }>,
    failError: new Error('inbox repository is unavailable'),
    handlerRuns: 0,
    handlerError: null as unknown,
  };

  const nextOutcome = (): RunOnceOutcome => (state.outcomes.length ? (state.outcomes.shift() as RunOnceOutcome) : 'apply');

  const repository = {
    state,

    runOnce: mock(async (messageId: string, handler: () => Promise<void>): Promise<boolean> => {
      const outcome = nextOutcome();

      if (outcome === 'fail') {
        state.calls.push({ messageId, handlerCalled: false });
        throw state.failError;
      }

      if (outcome === 'duplicate') {
        state.calls.push({ messageId, handlerCalled: false });
        return false;
      }

      state.calls.push({ messageId, handlerCalled: true });
      if (state.handlerError) {
        // The real repository runs the handler inside the transaction: a handler
        // failure aborts it and surfaces as a rejection of runOnce().
        throw state.handlerError;
      }

      state.handlerRuns += 1;
      await handler();
      return true;
    }),
  };

  return repository;
}

type FakeRepository = ReturnType<typeof createFakeRepository>;

let counters: Array<{ name: string; labels?: Record<string, string> }> = [];
let logLines: string[] = [];
let originalCounter: typeof metrics.counter;
let originalInfo: typeof logger.info;
let originalError: typeof logger.error;
let originalDebug: typeof logger.debug;

function captureTelemetry(): void {
  counters = [];
  logLines = [];
  originalCounter = metrics.counter;
  originalInfo = logger.info;
  originalError = logger.error;
  originalDebug = logger.debug;

  metrics.counter = ((name: string, labels?: Record<string, string>) => {
    counters.push({ name, labels });
  }) as typeof metrics.counter;
  logger.info = ((...args: unknown[]) => {
    logLines.push(args.map(String).join(' '));
  }) as typeof logger.info;
  logger.error = ((...args: unknown[]) => {
    logLines.push(args.map(String).join(' '));
  }) as typeof logger.error;
  logger.debug = ((...args: unknown[]) => {
    logLines.push(args.map(String).join(' '));
  }) as typeof logger.debug;
}

function restoreTelemetry(): void {
  metrics.counter = originalCounter;
  logger.info = originalInfo;
  logger.error = originalError;
  logger.debug = originalDebug;
}

function names(): string[] {
  return counters.map((entry) => entry.name);
}

describe('InboxConsumerService (unit, fake repository)', () => {
  let repository: FakeRepository;
  let service: InboxConsumerService;
  let handlerRuns: number;

  beforeEach(() => {
    repository = createFakeRepository();
    service = new InboxConsumerService(
      repository as unknown as InboxConsumerMessageRepository,
      3,
      5,
      20,
    );
    handlerRuns = 0;
    captureTelemetry();
  });

  afterEach(() => {
    restoreTelemetry();
  });

  const handler = async (): Promise<void> => {
    handlerRuns += 1;
  };

  test('a successful delivery is acked and counted once, and the queue is running', async () => {
    const outcome = await service.handle(QUEUE, makeMessage('Governance_VoteCast', {}), handler);

    expect(outcome).toBe('acked');
    expect(handlerRuns).toBe(1);
    expect(repository.state.calls).toHaveLength(1);
    expect(names()).toEqual(['inbox_consumer_processed_total']);
    expect(counters[0].labels).toEqual({ queue: QUEUE });
    expect(service.status(QUEUE)).toBe('running');
  });

  test('a duplicate is acked without running the handler and counted as a duplicate', async () => {
    repository.state.outcomes = ['duplicate'];

    const outcome = await service.handle(QUEUE, makeMessage('Governance_VoteCast', {}), handler);

    expect(outcome).toBe('acked');
    expect(handlerRuns).toBe(0);
    expect(names()).toEqual(['inbox_consumer_duplicates_total']);
    expect(logLines.some((line) => line.includes('duplicate message skipped'))).toBe(true);
  });

  test('a delivery without messageId cannot be deduplicated: it retries and then halts', async () => {
    const message = makeMessage('Governance_VoteCast', {}, { messageId: null });

    const outcome = await service.handle(QUEUE, message, handler);

    expect(outcome).toBe('halted');
    expect(handlerRuns).toBe(0);
    // No attempt ever reaches the repository: the guard fires before runOnce.
    expect(repository.state.calls).toHaveLength(0);
    expect(names().filter((name) => name === 'inbox_consumer_retries_total')).toHaveLength(3);
    expect(names()).toContain('inbox_consumer_halted_total');
    expect(service.status(QUEUE)).toBe('halted');
    expect(logLines.some((line) => line.includes('the message has no messageId'))).toBe(true);
  });

  test('a failure is retried and a later success acks the delivery', async () => {
    repository.state.outcomes = ['fail', 'apply'];

    const outcome = await service.handle(QUEUE, makeMessage('Governance_VoteCast', {}), handler);

    expect(outcome).toBe('acked');
    expect(handlerRuns).toBe(1);
    expect(repository.state.calls).toHaveLength(2);
    expect(names()).toContain('inbox_consumer_retries_total');
    expect(names()).toContain('inbox_consumer_processed_total');
    expect(service.status(QUEUE)).toBe('running');
    expect(logLines.some((line) => line.includes('attempt 1/3 failed; retrying in 5ms'))).toBe(true);
  });

  test('a handler failure inside the transaction is retried and can succeed on the next attempt', async () => {
    repository.state.outcomes = ['apply', 'apply'];
    repository.state.handlerError = new Error('db write failed inside the handler');

    const first = await service.handle(QUEUE, makeMessage('Governance_VoteCast', {}), handler);
    expect(first).toBe('halted');

    // The same message is redelivered later (after the probe) and now succeeds.
    repository.state.handlerError = null;
    const second = await service.handle(QUEUE, makeMessage('Governance_VoteCast', {}), handler);

    expect(second).toBe('acked');
  });

  test('after the last attempt the stream halts and the queue is marked halted', async () => {
    repository.state.outcomes = ['fail', 'fail', 'fail'];

    const outcome = await service.handle(QUEUE, makeMessage('Governance_VoteCast', {}), handler);

    expect(outcome).toBe('halted');
    expect(repository.state.calls).toHaveLength(3);
    expect(names().filter((name) => name === 'inbox_consumer_retries_total')).toHaveLength(3);
    expect(names().filter((name) => name === 'inbox_consumer_halted_total')).toHaveLength(1);
    expect(service.status(QUEUE)).toBe('halted');
    expect(logLines.some((line) => line.includes('HALTED: inbox repository is unavailable'))).toBe(true);
  });

  test('a delivery to an already halted queue runs the whole cycle again (the requeued head message)', async () => {
    repository.state.outcomes = ['fail', 'fail', 'fail'];
    await service.handle(QUEUE, makeMessage('Governance_VoteCast', {}), handler);
    expect(service.status(QUEUE)).toBe('halted');

    repository.state.outcomes = ['apply'];
    const outcome = await service.handle(QUEUE, makeMessage('Governance_VoteCast', {}), handler);

    expect(outcome).toBe('acked');
    expect(service.status(QUEUE)).toBe('running');
    expect(logLines.some((line) => line.includes('retrying the halted message'))).toBe(true);
  });

  test('the backoff grows between attempts and stays inside the cap', async () => {
    const slow = new InboxConsumerService(repository as unknown as InboxConsumerMessageRepository, 5, 5, 10);
    repository.state.outcomes = ['fail', 'fail', 'fail', 'fail', 'fail'];
    const startedAt = Date.now();

    const outcome = await slow.handle(QUEUE, makeMessage('Governance_VoteCast', {}), handler);

    // Delays between five attempts: 5 + 10 + 10 + 10 = 35ms (5ms doubling into the 10ms cap).
    const elapsed = Date.now() - startedAt;
    expect(outcome).toBe('halted');
    expect(elapsed).toBeGreaterThanOrEqual(35);
    expect(repository.state.calls).toHaveLength(5);
  });

  test('with a single allowed attempt a failure halts immediately, without waiting', async () => {
    const strict = new InboxConsumerService(repository as unknown as InboxConsumerMessageRepository, 1, 5_000, 5_000);
    repository.state.outcomes = ['fail'];
    const startedAt = Date.now();

    const outcome = await strict.handle(QUEUE, makeMessage('Governance_VoteCast', {}), handler);

    expect(outcome).toBe('halted');
    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(repository.state.calls).toHaveLength(1);
  });

  test('a non-Error value thrown by the repository still halts with a readable reason', async () => {
    repository.state.failError = 'plain string failure' as unknown as Error;
    repository.state.outcomes = ['fail', 'fail', 'fail'];

    const outcome = await service.handle(QUEUE, makeMessage('Governance_VoteCast', {}), handler);

    expect(outcome).toBe('halted');
    expect(logLines.some((line) => line.includes('HALTED: plain string failure'))).toBe(true);
  });

  test('status defaults to running and markProbed brings a halted queue back', async () => {
    expect(service.status('never-seen-queue')).toBe('running');

    repository.state.outcomes = ['fail', 'fail', 'fail'];
    await service.handle(QUEUE, makeMessage('Governance_VoteCast', {}), handler);
    expect(service.status(QUEUE)).toBe('halted');

    service.markProbed(QUEUE);

    expect(service.status(QUEUE)).toBe('running');
    expect(logLines.some((line) => line.includes('probed — resubscribed to the queue'))).toBe(true);
  });

  test('queues do not share halt state', async () => {
    repository.state.outcomes = ['fail', 'fail', 'fail'];
    await service.handle(QUEUE, makeMessage('Governance_VoteCast', {}), handler);

    expect(service.status(QUEUE)).toBe('halted');
    expect(service.status('blockchain.events.other')).toBe('running');
  });

  test('each delivery counts its own retries (the counter is not cumulative)', async () => {
    repository.state.outcomes = ['fail', 'apply'];
    await service.handle(QUEUE, makeMessage('Governance_VoteCast', {}), handler);
    const afterFirst = names().filter((name) => name === 'inbox_consumer_retries_total').length;

    repository.state.outcomes = ['apply'];
    await service.handle(QUEUE, makeMessage('Governance_VoteCast', {}), handler);
    const afterSecond = names().filter((name) => name === 'inbox_consumer_retries_total').length;

    expect(afterFirst).toBe(1);
    expect(afterSecond).toBe(1);
  });
});
