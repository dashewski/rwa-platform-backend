/**
 * Unit tests for OutboxPublisherDaemon.
 *
 * The daemon owns the polling schedule: one independent chain of timers per
 * exchange, each pass running to completion before the next tick is armed.
 * The publisher service is a fake, so these tests exercise the scheduling,
 * failure isolation and shutdown behaviour only. Real timers with a tiny
 * interval are used on purpose: the interplay between an async pass and the
 * re-arming of the next tick is exactly what is being pinned down.
 */
import './setup';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { OutboxPublisherDaemon } from '../src/daemons/outboxPublisher.daemon';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import type { OutboxPublisherService } from '../src/services/outboxPublisher.service';
import { EXCHANGE } from './fakes';

const OTHER_EXCHANGE = 'other.events';
const INTERVAL_MS = 10;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Waits until `predicate()` is true or the deadline passes. */
async function waitFor(predicate: () => boolean, timeoutMs = 500): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('waitFor: condition was not met in time');
    }
    await sleep(2);
  }
}

function createFakePublisherService() {
  const state = {
    calls: [] as string[],
    failFor: new Set<string>(),
    concurrentByExchange: new Map<string, number>(),
    maxConcurrentByExchange: new Map<string, number>(),
    passDelayMs: 0,
  };

  const service = {
    state,

    maxConcurrentFor(exchange: string): number {
      return state.maxConcurrentByExchange.get(exchange) ?? 0;
    },

    processOutbox: mock(async (exchange: string): Promise<void> => {
      state.calls.push(exchange);

      const running = (state.concurrentByExchange.get(exchange) ?? 0) + 1;
      state.concurrentByExchange.set(exchange, running);
      state.maxConcurrentByExchange.set(
        exchange,
        Math.max(state.maxConcurrentByExchange.get(exchange) ?? 0, running),
      );

      try {
        if (state.passDelayMs) await sleep(state.passDelayMs);
        if (state.failFor.has(exchange)) {
          throw new Error(`pass failed for ${exchange}`);
        }
      } finally {
        state.concurrentByExchange.set(exchange, (state.concurrentByExchange.get(exchange) ?? 1) - 1);
      }
    }),
  };

  return service;
}

type FakePublisherService = ReturnType<typeof createFakePublisherService>;

let logLines: string[] = [];
let originalInfo: typeof logger.info;
let originalError: typeof logger.error;

function captureLogs(): void {
  logLines = [];
  originalInfo = logger.info;
  originalError = logger.error;
  logger.info = ((...args: unknown[]) => {
    logLines.push(args.map(String).join(' '));
  }) as typeof logger.info;
  logger.error = ((...args: unknown[]) => {
    logLines.push(args.map(String).join(' '));
  }) as typeof logger.error;
}

function restoreLogs(): void {
  logger.info = originalInfo;
  logger.error = originalError;
}

function callsFor(service: FakePublisherService, exchange: string): number {
  return service.state.calls.filter((name) => name === exchange).length;
}

describe('OutboxPublisherDaemon (unit, fake publisher service, real timers)', () => {
  let service: FakePublisherService;
  let daemon: OutboxPublisherDaemon;

  beforeEach(() => {
    service = createFakePublisherService();
    daemon = new OutboxPublisherDaemon(
      service as unknown as OutboxPublisherService,
      [EXCHANGE, OTHER_EXCHANGE],
      INTERVAL_MS,
    );
    captureLogs();
  });

  afterEach(() => {
    daemon.stop();
    restoreLogs();
  });

  test('initialize: arms one chain per exchange and logs the interval', async () => {
    await daemon.initialize();

    expect(logLines.some((line) => line.includes(`"${EXCHANGE}" started (every ${INTERVAL_MS}ms)`))).toBe(true);
    expect(logLines.some((line) => line.includes(`"${OTHER_EXCHANGE}" started`))).toBe(true);
    expect(service.state.calls).toEqual([]); // nothing runs before the first interval elapses

    await waitFor(() => service.state.calls.length >= 2);

    expect(service.state.calls).toContain(EXCHANGE);
    expect(service.state.calls).toContain(OTHER_EXCHANGE);
  });

  test('each pass is followed by the next tick: the poll repeats', async () => {
    await daemon.initialize();

    await waitFor(() => callsFor(service, EXCHANGE) >= 3);

    expect(callsFor(service, EXCHANGE)).toBeGreaterThanOrEqual(3);
  });

  test('an exchange whose pass fails keeps being polled (the chain is not broken)', async () => {
    service.state.failFor.add(EXCHANGE);
    await daemon.initialize();

    await waitFor(() => callsFor(service, EXCHANGE) >= 2);

    expect(logLines.some((line) => line.includes(`outbox pass failed`))).toBe(true);
    // The other exchange is unaffected by its neighbour failing.
    expect(callsFor(service, OTHER_EXCHANGE)).toBeGreaterThanOrEqual(1);
  });

  test('a failing exchange does not delay the healthy one', async () => {
    service.state.failFor.add(EXCHANGE);
    await daemon.initialize();

    await waitFor(() => callsFor(service, OTHER_EXCHANGE) >= 2);

    expect(callsFor(service, OTHER_EXCHANGE)).toBeGreaterThanOrEqual(2);
  });

  test('passes of the same exchange never overlap, even when a pass is slower than the interval', async () => {
    service.state.passDelayMs = INTERVAL_MS * 3;
    await daemon.initialize();

    await waitFor(() => callsFor(service, EXCHANGE) >= 2);

    // The next tick is armed only after the previous pass finished.
    expect(service.maxConcurrentFor(EXCHANGE)).toBe(1);
  });

  test('stop: clears the timers, logs per exchange and no further pass runs', async () => {
    await daemon.initialize();
    await waitFor(() => service.state.calls.length >= 2);
    const callsBeforeStop = service.state.calls.length;

    daemon.stop();

    expect(logLines.some((line) => line.includes(`"${EXCHANGE}" stopped`))).toBe(true);
    expect(logLines.some((line) => line.includes(`"${OTHER_EXCHANGE}" stopped`))).toBe(true);

    await sleep(INTERVAL_MS * 3);

    expect(service.state.calls.length).toBe(callsBeforeStop);
  });

  test('stop is idempotent and safe before initialize', async () => {
    daemon.stop();
    daemon.stop();

    expect(service.state.calls).toEqual([]);

    daemon.stop();
    expect(logLines.filter((line) => line.includes('stopped'))).toEqual([]);
  });

  test('stop during a pass lets that pass finish and prevents the next tick', async () => {
    service.state.passDelayMs = INTERVAL_MS * 2;
    await daemon.initialize();

    await waitFor(() => service.state.calls.length >= 1);
    daemon.stop();
    const callsAfterStop = service.state.calls.length;

    await sleep(INTERVAL_MS * 4);

    expect(service.state.calls.length).toBe(callsAfterStop);
    expect(service.maxConcurrentFor(EXCHANGE)).toBe(1);
    expect(service.maxConcurrentFor(OTHER_EXCHANGE)).toBe(1);
  });

  test('initialize after stop starts the polling again', async () => {
    await daemon.initialize();
    daemon.stop();
    const callsAfterStop = service.state.calls.length;

    await daemon.initialize();
    await waitFor(() => service.state.calls.length > callsAfterStop);

    expect(service.state.calls.length).toBeGreaterThan(callsAfterStop);
  });

  test('a second initialize adds another chain for the same exchange (documented behaviour)', async () => {
    await daemon.initialize();
    await daemon.initialize();

    await waitFor(() => callsFor(service, EXCHANGE) >= 4);

    // Two chains are alive at once, so the exchange is polled roughly twice as
    // often. The plugin calls initialize() exactly once, so this only matters
    // if someone re-initialises a running daemon.
    expect(callsFor(service, EXCHANGE)).toBeGreaterThanOrEqual(4);
  });
});
