/**
 * Unit tests for BaseOutboxPublisherDaemon.
 *
 * The daemon owns the polling schedule: one independent chain of timers per
 * exchange, each pass running to completion before the next tick is armed.
 * The publisher service is a fake, so these tests exercise scheduling, failure
 * isolation and shutdown only. Real timers with a tiny interval are used on
 * purpose: the interplay between an async pass and the re-arming of the next
 * tick is exactly what is being pinned down.
 */
import './setup';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { BaseOutboxPublisherDaemon } from '../src/daemons/baseOutboxPublisher.daemon';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import type { OutboxPublisherService } from '../src/services/outboxPublisher.service';
import { EXCHANGE } from './fakes';

const OTHER_EXCHANGE = 'other.events';
const INTERVAL_MS = 10;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate: () => boolean, timeoutMs = 500): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error('waitFor: condition was not met in time');
    await sleep(2);
  }
}

function createFakePublisherService() {
  const state = {
    calls: [] as Array<{ exchange: string; isSync: boolean; concurrency: number; maxAttempts: number }>,
    failFor: new Set<string>(),
    running: new Map<string, number>(),
    maxRunning: new Map<string, number>(),
    passDelayMs: 0,
  };

  const service = {
    state,

    maxConcurrentFor(exchange: string): number {
      return state.maxRunning.get(exchange) ?? 0;
    },

    processOutbox: mock(
      async (exchange: string, isSync: boolean, concurrency: number, maxAttempts: number): Promise<void> => {
        state.calls.push({ exchange, isSync, concurrency, maxAttempts });

        const running = (state.running.get(exchange) ?? 0) + 1;
        state.running.set(exchange, running);
        state.maxRunning.set(exchange, Math.max(state.maxRunning.get(exchange) ?? 0, running));

        try {
          if (state.passDelayMs) await sleep(state.passDelayMs);
          if (state.failFor.has(exchange)) throw new Error(`pass for ${exchange} exploded`);
        } finally {
          state.running.set(exchange, (state.running.get(exchange) ?? 1) - 1);
        }
      },
    ),
  };

  return service;
}

type FakePublisherService = ReturnType<typeof createFakePublisherService>;

/** The daemon is abstract: the test subclass pins the exchange config. */
class TestOutboxDaemon extends BaseOutboxPublisherDaemon {
  constructor(service: FakePublisherService, config: Record<string, { isSync: boolean; concurrency: number; maxAttempts: number }>) {
    super(service as unknown as OutboxPublisherService, INTERVAL_MS, config as never);
  }
}

let logLines: string[] = [];
const original = { info: logger.info, error: logger.error };

function captureLogs(): void {
  logLines = [];
  logger.info = ((...args: unknown[]) => {
    logLines.push(args.map(String).join(' '));
  }) as typeof logger.info;
  logger.error = ((...args: unknown[]) => {
    logLines.push(args.map(String).join(' '));
  }) as typeof logger.error;
}

function restoreLogs(): void {
  logger.info = original.info;
  logger.error = original.error;
}

describe('BaseOutboxPublisherDaemon (unit, fake publisher service)', () => {
  let service: FakePublisherService;
  let daemon: TestOutboxDaemon;

  const config = {
    [EXCHANGE]: { isSync: true, concurrency: 1, maxAttempts: Number.POSITIVE_INFINITY },
    [OTHER_EXCHANGE]: { isSync: false, concurrency: 5, maxAttempts: 5 },
  };

  beforeEach(() => {
    service = createFakePublisherService();
    daemon = new TestOutboxDaemon(service, config);
    captureLogs();
  });

  afterEach(() => {
    daemon.stop();
    restoreLogs();
  });

  test('initialize arms a pass for every configured exchange and logs it', async () => {
    await daemon.initialize();

    await waitFor(() => service.state.calls.length >= 2);

    expect(service.state.calls.map((call) => call.exchange).sort()).toEqual([OTHER_EXCHANGE, EXCHANGE].sort());
    expect(logLines.some((line) => line.includes(`Outbox publisher daemon "${EXCHANGE}" started`))).toBe(true);
  });

  test('every pass receives the exchange config verbatim', async () => {
    await daemon.initialize();

    await waitFor(() => service.state.calls.some((call) => call.exchange === OTHER_EXCHANGE));

    const syncCall = service.state.calls.find((call) => call.exchange === EXCHANGE)!;
    const asyncCall = service.state.calls.find((call) => call.exchange === OTHER_EXCHANGE)!;

    expect(syncCall).toEqual({
      exchange: EXCHANGE,
      isSync: true,
      concurrency: 1,
      maxAttempts: Number.POSITIVE_INFINITY,
    });
    expect(asyncCall).toEqual({ exchange: OTHER_EXCHANGE, isSync: false, concurrency: 5, maxAttempts: 5 });
  });

  test('a failing pass is logged and does not stop the schedule', async () => {
    service.state.failFor.add(EXCHANGE);

    await daemon.initialize();
    await waitFor(() => service.state.calls.filter((call) => call.exchange === EXCHANGE).length >= 3);

    expect(logLines.some((line) => line.includes(`outbox pass failed`))).toBe(true);
  });

  test('passes of the same exchange never overlap (the next tick is armed after the pass)', async () => {
    service.state.passDelayMs = 25;

    await daemon.initialize();
    await waitFor(() => service.state.calls.filter((call) => call.exchange === EXCHANGE).length >= 2);

    expect(service.maxConcurrentFor(EXCHANGE)).toBe(1);
  });

  test('stop ends the schedule', async () => {
    await daemon.initialize();
    await waitFor(() => service.state.calls.length > 0);

    daemon.stop();
    const callsAtStop = service.state.calls.length;

    await sleep(INTERVAL_MS * 4);

    expect(service.state.calls.length).toBe(callsAtStop);
    expect(logLines.some((line) => line.includes(`Outbox publisher daemon "${EXCHANGE}" stopped`))).toBe(true);
  });

  test('stop before initialize is a no-op', () => {
    daemon.stop();

    expect(logLines.filter((line) => line.includes('stopped'))).toEqual([]);
  });

  test('initialize after stop resumes the schedule', async () => {
    await daemon.initialize();
    await waitFor(() => service.state.calls.length > 0);
    daemon.stop();
    const callsAtStop = service.state.calls.length;

    await daemon.initialize();
    await waitFor(() => service.state.calls.length > callsAtStop);

    expect(service.state.calls.length).toBeGreaterThan(callsAtStop);
  });
});
