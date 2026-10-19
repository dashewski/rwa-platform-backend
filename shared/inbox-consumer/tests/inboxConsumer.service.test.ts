/**
 * Unit tests for InboxConsumerService — attempts, dedup outcome and the
 * transaction boundary.
 *
 * The transaction lives here (not in the repository), so the mongoose
 * connection is stubbed to run the callback inline and to record how often it
 * was opened. The repository itself is a fake: its own file pins the marker
 * behaviour.
 */
import './setup';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import mongoose from 'mongoose';
import { InboxConsumerService } from '../src/services/inboxConsumer.service';
import { metrics } from '@shared/monitoring/src/metrics';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import type { InboxConsumerMessageRepository } from '../src/repositories/inboxConsumerMessage.repository';
import { makeMessage, QUEUE } from './fakes';

type CreateOutcome = 'created' | 'duplicate' | 'fail';

/** Runs the callback inline and records every transaction the service opens. */
function stubTransaction() {
  const state = {
    calls: 0,
    error: null as unknown,
    beforeRun: null as null | (() => Promise<void> | void),
  };

  const original = (mongoose.connection as unknown as { transaction: unknown }).transaction;

  (mongoose.connection as unknown as { transaction: unknown }).transaction = async <T>(
    fn: () => Promise<T>,
  ): Promise<T> => {
    state.calls += 1;

    if (state.beforeRun) await state.beforeRun();
    if (state.error) throw state.error;

    return await fn();
  };

  return {
    state,
    restore: () => {
      (mongoose.connection as unknown as { transaction: unknown }).transaction = original;
    },
  };
}

function createFakeRepository() {
  const state = {
    outcomes: [] as CreateOutcome[],
    calls: [] as string[],
    failError: new Error('inbox repository is unavailable') as unknown,
    handlerRuns: 0,
  };

  const nextOutcome = (): CreateOutcome => (state.outcomes.length ? (state.outcomes.shift() as CreateOutcome) : 'created');

  const repository = {
    state,

    create: mock(async (messageId: string): Promise<boolean> => {
      const outcome = nextOutcome();
      state.calls.push(messageId);

      if (outcome === 'fail') throw state.failError;
      if (outcome === 'duplicate') return false;

      return true;
    }),
  };

  return repository;
}

type FakeRepository = ReturnType<typeof createFakeRepository>;

let counters: Array<{ name: string; labels?: Record<string, string> }> = [];
let logLines: string[] = [];
const original = {
  counter: metrics.counter,
  info: logger.info,
  error: logger.error,
  debug: logger.debug,
};

function captureTelemetry(): void {
  counters = [];
  logLines = [];

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
  metrics.counter = original.counter;
  logger.info = original.info;
  logger.error = original.error;
  logger.debug = original.debug;
}

const names = (): string[] => counters.map((entry) => entry.name);
const countOf = (name: string): number => names().filter((entry) => entry === name).length;

describe('InboxConsumerService (unit, fake repository + stubbed transaction)', () => {
  let repository: FakeRepository;
  let service: InboxConsumerService;
  let transaction: ReturnType<typeof stubTransaction>;
  let handlerRuns: number;

  const handler = async (): Promise<void> => {
    handlerRuns += 1;
  };

  beforeEach(() => {
    transaction = stubTransaction();
    repository = createFakeRepository();
    service = new InboxConsumerService(
      repository as unknown as InboxConsumerMessageRepository,
      5,
      20,
    );
    handlerRuns = 0;
    captureTelemetry();
  });

  afterEach(() => {
    restoreTelemetry();
    transaction.restore();
  });

  test('a successful delivery is acked inside one transaction and counted as processed', async () => {
    const outcome = await service.handle(QUEUE, makeMessage('Governance_VoteCast', {}), handler, 3);

    expect(outcome).toBe('acked');
    expect(handlerRuns).toBe(1);
    expect(repository.state.calls).toEqual(['31337:0xabc:3']);
    expect(transaction.state.calls).toBe(1);
    expect(names()).toEqual(['inbox_consumer_processed_total']);
    expect(counters[0].labels).toEqual({ queue: QUEUE });
  });

  test('a duplicate marker acks the delivery without running the handler', async () => {
    repository.state.outcomes = ['duplicate'];

    const outcome = await service.handle(QUEUE, makeMessage('Governance_VoteCast', {}), handler, 3);

    expect(outcome).toBe('acked');
    expect(handlerRuns).toBe(0);
    expect(transaction.state.calls).toBe(1);
    expect(names()).toEqual(['inbox_consumer_duplicates_total']);
    expect(logLines.some((line) => line.includes('duplicate message skipped'))).toBe(true);
  });

  test('the handler runs in the same transaction as the marker insert', async () => {
    const order: string[] = [];
    const create = repository.create.getMockImplementation()!;
    repository.create.mockImplementation(async (messageId: string) => {
      order.push('marker');
      return create(messageId);
    });

    await service.handle(QUEUE, makeMessage('Governance_VoteCast', {}), async () => {
      order.push('handler');
    });

    expect(order).toEqual(['marker', 'handler']);
    expect(transaction.state.calls).toBe(1);
  });

  test('a delivery without messageId is retried and then deferred (the inbox cannot deduplicate it)', async () => {
    const message = makeMessage('Governance_VoteCast', {}, { messageId: null });

    const outcome = await service.handle(QUEUE, message, handler, 3);

    expect(outcome).toBe('deferred');
    expect(handlerRuns).toBe(0);
    expect(repository.state.calls).toEqual([]);
    expect(transaction.state.calls).toBe(0);
    expect(countOf('inbox_consumer_retries_total')).toBe(3);
    expect(countOf('inbox_consumer_deferred_total')).toBe(1);
    expect(logLines.some((line) => line.includes('the message has no messageId'))).toBe(true);
  });

  test('a failure followed by a success acks the delivery and logs the retry', async () => {
    repository.state.outcomes = ['fail', 'created'];

    const outcome = await service.handle(QUEUE, makeMessage('Governance_VoteCast', {}), handler, 3);

    expect(outcome).toBe('acked');
    expect(handlerRuns).toBe(1);
    expect(repository.state.calls).toHaveLength(2);
    expect(countOf('inbox_consumer_retries_total')).toBe(1);
    expect(countOf('inbox_consumer_processed_total')).toBe(1);
    expect(logLines.some((line) => line.includes('attempt 1/3 failed; retrying in 5ms'))).toBe(true);
  });

  test('a handler failure aborts the transaction and the delivery is retried', async () => {
    await expect(
      service.handle(QUEUE, makeMessage('Governance_VoteCast', {}), async () => {
        throw new Error('db write failed inside the handler');
      }, 3),
    ).resolves.toBe('deferred');

    expect(transaction.state.calls).toBe(3);
    expect(countOf('inbox_consumer_retries_total')).toBe(3);
    expect(countOf('inbox_consumer_deferred_total')).toBe(1);
    expect(logLines.some((line) => line.includes('db write failed inside the handler'))).toBe(true);
  });

  test('after the last attempt the delivery is deferred to the retry queue', async () => {
    repository.state.outcomes = ['fail', 'fail', 'fail'];

    const outcome = await service.handle(QUEUE, makeMessage('Governance_VoteCast', {}), handler, 3);

    expect(outcome).toBe('deferred');
    expect(repository.state.calls).toHaveLength(3);
    expect(countOf('inbox_consumer_retries_total')).toBe(3);
    expect(countOf('inbox_consumer_deferred_total')).toBe(1);
    expect(logLines.some((line) => line.includes('attempts exhausted (3)'))).toBe(true);
  });

  test('maxAttempts comes from the queue config, not the constructor', async () => {
    repository.state.outcomes = ['fail', 'fail'];

    const outcome = await service.handle(
      QUEUE,
      makeMessage('Governance_VoteCast', {}),
      handler,
      2,
    );

    expect(outcome).toBe('deferred');
    expect(repository.state.calls).toHaveLength(2);
    expect(countOf('inbox_consumer_retries_total')).toBe(2);
  });

  test('a single allowed attempt defers immediately, without waiting', async () => {
    repository.state.outcomes = ['fail'];
    const startedAt = Date.now();

    const outcome = await service.handle(QUEUE, makeMessage('Governance_VoteCast', {}), handler, 1);

    expect(outcome).toBe('deferred');
    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(repository.state.calls).toHaveLength(1);
  });

  test('the backoff grows between attempts and is capped', async () => {
    const slow = new InboxConsumerService(repository as unknown as InboxConsumerMessageRepository, 5, 10);
    repository.state.outcomes = ['fail', 'fail', 'fail', 'fail'];
    const startedAt = Date.now();

    const outcome = await slow.handle(QUEUE, makeMessage('Governance_VoteCast', {}), handler, 4);

    // Delays: 5 + 10 + 10 = 25ms (5ms doubling into the 10ms cap).
    expect(outcome).toBe('deferred');
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(25);
    expect(repository.state.calls).toHaveLength(4);
  });

  test('a non-Error failure is still reported readably', async () => {
    repository.state.failError = 'plain string failure';
    repository.state.outcomes = ['fail', 'fail', 'fail'];

    const outcome = await service.handle(QUEUE, makeMessage('Governance_VoteCast', {}), handler, 3);

    expect(outcome).toBe('deferred');
    expect(logLines.some((line) => line.includes('plain string failure'))).toBe(true);
  });

  test('each delivery counts only its own retries', async () => {
    repository.state.outcomes = ['fail', 'created'];
    await service.handle(QUEUE, makeMessage('Governance_VoteCast', {}), handler, 3);
    const afterFirst = countOf('inbox_consumer_retries_total');

    repository.state.outcomes = ['created'];
    await service.handle(QUEUE, makeMessage('Governance_VoteCast', {}), handler, 3);

    expect(afterFirst).toBe(1);
    expect(countOf('inbox_consumer_retries_total')).toBe(1);
  });

  test('the constructor switches mongoose to transactionAsyncLocalStorage (process-wide)', () => {
    const sets: unknown[][] = [];
    const originalSet = mongoose.set;
    (mongoose as unknown as { set: unknown }).set = (...args: unknown[]) => {
      sets.push(args);
      return mongoose;
    };

    try {
      new InboxConsumerService(repository as unknown as InboxConsumerMessageRepository);
    } finally {
      (mongoose as unknown as { set: unknown }).set = originalSet;
    }

    expect(sets).toContainEqual(['transactionAsyncLocalStorage', true]);
  });

  test('a transaction-level failure is retried and finally deferred', async () => {
    transaction.state.error = new Error('Transaction numbers are only allowed on a replica set member or mongos');

    const outcome = await service.handle(QUEUE, makeMessage('Governance_VoteCast', {}), handler, 3);

    expect(outcome).toBe('deferred');
    expect(transaction.state.calls).toBe(3);
    expect(repository.state.calls).toEqual([]);
  });
});
