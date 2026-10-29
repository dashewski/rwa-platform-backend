/**
 * Unit tests for OutboxPublisherService — the publish entry point and one pass
 * over an exchange (`processOutbox`).
 *
 * The repository and the RabbitMQ client are fakes: the assertions are about
 * the order of claim/publish/markSent, the stop-on-error contract of a sync
 * exchange, the sliding window of an async one, and the metric names.
 */
import './setup';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { OutboxPublisherService } from '../src/services/outboxPublisher.service';
import { AppError } from '@shared/errors/app-errors';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { metrics } from '@shared/monitoring/src/metrics';
import type { OutboxPublisherMessageRepository } from '../src/repositories/outboxPublisherMessage.repository';
import { asRabbitClient, createFakeRabbitClient, EXCHANGE, type FakeRabbitClient } from './fakes/rabbitmq.client.fake';

type Row = {
  _id: string;
  exchange: string;
  routingKey: string;
  payload: unknown;
  messageId: string;
  attempts: number;
  status: 'pending' | 'sending' | 'sent' | 'failed';
};

/**
 * In-memory outbox: rows are claimed in insertion order, publishes and status
 * transitions are recorded as one ordered event log so the pass can be checked
 * step by step.
 */
function createFakeRepository(rows: Row[] = []) {
  const state = {
    events: [] as string[],
    rows,
    releaseCalls: [] as string[],
    markSentCalls: [] as string[],
    markAttemptFailedCalls: [] as Array<{ id: string; maxAttempts: number }>,
    failClaim: null as Error | null,
    failMarkSent: null as Error | null,
    failMarkAttemptFailed: null as Error | null,
    markAttemptFailedResult: null as Row | null,
    claimDelayMs: 0,
  };

  const repository = {
    state,

    create: mock(async (data: { exchange: string; routingKey: string; payload: unknown; messageId: string }) => {
      state.events.push(`create:${data.messageId}`);

      const created: Row = {
        _id: `row-${state.rows.length + 1}`,
        exchange: data.exchange,
        routingKey: data.routingKey,
        payload: data.payload,
        messageId: data.messageId,
        attempts: 0,
        status: 'pending',
      };
      state.rows.push(created);

      return { ...created };
    }),

    releaseSending: mock(async (exchange: string): Promise<void> => {
      state.releaseCalls.push(exchange);
      state.events.push(`release:${exchange}`);
      for (const row of state.rows) {
        if (row.exchange === exchange && row.status === 'sending') row.status = 'pending';
      }
    }),

    claimNext: mock(async (exchange: string): Promise<Row | null> => {
      if (state.claimDelayMs) await new Promise((resolve) => setTimeout(resolve, state.claimDelayMs));
      if (state.failClaim) throw state.failClaim;

      const row = state.rows.find((entry) => entry.exchange === exchange && entry.status === 'pending');
      if (!row) return null;

      row.status = 'sending';
      state.events.push(`claim:${row.messageId}`);

      return { ...row };
    }),

    markSent: mock(async (id: string): Promise<void> => {
      if (state.failMarkSent) {
        state.events.push(`markSent-failed:${id}`);
        throw state.failMarkSent;
      }

      const row = state.rows.find((entry) => entry._id === id);
      if (row) row.status = 'sent';

      state.markSentCalls.push(id);
      state.events.push(`markSent:${id}`);
    }),

    markAttemptFailed: mock(async (id: string, maxAttempts: number): Promise<Row | null> => {
      state.markAttemptFailedCalls.push({ id, maxAttempts });
      if (state.failMarkAttemptFailed) throw state.failMarkAttemptFailed;

      if (state.markAttemptFailedResult) return state.markAttemptFailedResult;

      const row = state.rows.find((entry) => entry._id === id);
      if (!row) return null;

      row.attempts += 1;
      row.status = row.attempts >= maxAttempts ? 'failed' : 'sending';
      state.events.push(`attemptFailed:${id}:${row.attempts}:${row.status}`);

      return { ...row };
    }),
  };

  return repository;
}

type FakeRepository = ReturnType<typeof createFakeRepository>;

function row(overrides: Partial<Row> = {}): Row {
  return {
    _id: `row-${Math.random().toString(16).slice(2)}`,
    exchange: EXCHANGE,
    routingKey: 'Governance_VoteCast',
    payload: { a: 1 },
    messageId: `msg-${Math.random().toString(16).slice(2)}`,
    attempts: 0,
    status: 'pending',
    ...overrides,
  };
}

let counters: Array<{ name: string; labels?: Record<string, string> }> = [];
let logLines: string[] = [];
const original = {
  info: logger.info,
  error: logger.error,
  counter: metrics.counter,
};

function captureTelemetry(): void {
  counters = [];
  logLines = [];

  logger.info = ((...args: unknown[]) => {
    logLines.push(args.map(String).join(' '));
  }) as typeof logger.info;
  logger.error = ((...args: unknown[]) => {
    logLines.push(args.map(String).join(' '));
  }) as typeof logger.error;
  metrics.counter = ((name: string, labels?: Record<string, string>) => {
    counters.push({ name, labels });
  }) as typeof metrics.counter;
}

function restoreTelemetry(): void {
  logger.info = original.info;
  logger.error = original.error;
  metrics.counter = original.counter;
}

const names = (): string[] => counters.map((entry) => entry.name);
const countOf = (name: string): number => names().filter((entry) => entry === name).length;

describe('OutboxPublisherService (unit, fake repository + fake rabbit client)', () => {
  let rabbit: FakeRabbitClient;
  let repository: FakeRepository;
  let service: OutboxPublisherService;

  function build(rows: Row[] = []): void {
    rabbit = createFakeRabbitClient();
    repository = createFakeRepository(rows);
    service = new OutboxPublisherService(
      asRabbitClient(rabbit),
      repository as unknown as OutboxPublisherMessageRepository,
    );
  }

  beforeEach(() => {
    build();
    captureTelemetry();
  });

  afterEach(() => {
    restoreTelemetry();
  });

  describe('publish', () => {
    test('queues a message in the outbox and counts it', async () => {
      await service.publish(EXCHANGE, 'Governance_VoteCast', { a: 1 }, 'msg-1');

      expect(repository.state.rows).toEqual([
        {
          _id: 'row-1',
          exchange: EXCHANGE,
          routingKey: 'Governance_VoteCast',
          payload: { a: 1 },
          messageId: 'msg-1',
          attempts: 0,
          status: 'pending',
        },
      ]);
      expect(counters).toEqual([{ name: 'outbox_publisher_queued_total', labels: { exchange: EXCHANGE } }]);
    });

    test('an exchange that is not part of the topology is rejected before any write', async () => {
      await expect(service.publish('blockchain.eventz', 'x', {}, 'msg-1')).rejects.toThrow(AppError);
      await expect(service.publish('blockchain.eventz', 'x', {}, 'msg-1')).rejects.toThrow(
        'Exchange "blockchain.eventz" is not registered in the RabbitMQ client',
      );
    });

    test('a duplicate messageId is not counted twice', async () => {
      const failingRepository = {
        create: mock(async () => null),
      };
      const svc = new OutboxPublisherService(
        asRabbitClient(rabbit),
        failingRepository as unknown as OutboxPublisherMessageRepository,
      );

      await svc.publish(EXCHANGE, 'Governance_VoteCast', {}, 'msg-1');

      expect(counters).toEqual([]);
    });

    test('the message is stored with its exchange, routing key, payload and messageId', async () => {
      const created: unknown[] = [];
      const recordingRepository = {
        create: mock(async (data: unknown) => {
          created.push(data);
          return { _id: 'row' };
        }),
      };
      const svc = new OutboxPublisherService(
        asRabbitClient(rabbit),
        recordingRepository as unknown as OutboxPublisherMessageRepository,
      );

      await svc.publish(EXCHANGE, 'Pool_RwaMinted', { poolId: '7' }, 'msg-9');

      expect(created).toEqual([
        { exchange: EXCHANGE, routingKey: 'Pool_RwaMinted', payload: { poolId: '7' }, messageId: 'msg-9' },
      ]);
    });
  });

  describe('processOutbox, isSync = true (strict order)', () => {
    test('releases the stuck rows first, then publishes pending rows one by one in order', async () => {
      build([row({ _id: 'a', messageId: 'm1' }), row({ _id: 'b', messageId: 'm2' })]);

      await service.processOutbox(EXCHANGE, true, 1, 5);

      expect(repository.state.releaseCalls).toEqual([EXCHANGE]);
      expect(repository.state.events).toEqual([
        `release:${EXCHANGE}`,
        'claim:m1',
        'markSent:a',
        'claim:m2',
        'markSent:b',
      ]);
      expect(rabbit.published.map((entry) => entry.options?.messageId)).toEqual(['m1', 'm2']);
      expect(countOf('outbox_publisher_published_total')).toBe(2);
      expect(repository.state.rows.every((entry) => entry.status === 'sent')).toBe(true);
    });

    test('a publish failure stops the pass at the first row and leaves the rest untouched', async () => {
      build([row({ _id: 'a', messageId: 'm1' }), row({ _id: 'b', messageId: 'm2' })]);
      rabbit.state.failNextPublish = new Error('channel closed');

      await service.processOutbox(EXCHANGE, true, 1, 5);

      expect(repository.state.events).toEqual([`release:${EXCHANGE}`, 'claim:m1', 'attemptFailed:a:1:sending']);
      expect(repository.state.rows.find((entry) => entry._id === 'b')?.status).toBe('pending');
      expect(countOf('outbox_publisher_published_total')).toBe(0);
    });

    test('one attempt per pass: the failed row is not retried inside the same pass', async () => {
      build([row({ _id: 'a', messageId: 'm1', attempts: 2 })]);
      rabbit.state.failNextPublish = new Error('channel closed');

      await service.processOutbox(EXCHANGE, true, 1, 5);

      expect(rabbit.publish).toHaveBeenCalledTimes(1);
      expect(repository.state.markAttemptFailedCalls).toEqual([{ id: 'a', maxAttempts: 5 }]);
    });

    test('reaching maxAttempts marks the row failed and does not retry it anymore', async () => {
      build([row({ _id: 'a', messageId: 'm1', attempts: 4 })]);
      rabbit.state.failNextPublish = new Error('channel closed');

      await service.processOutbox(EXCHANGE, true, 1, 5);

      expect(repository.state.rows[0].status).toBe('failed');
      expect(countOf('outbox_publisher_failed_total')).toBe(1);
      expect(logLines.some((line) => line.includes('failed after 5 attempts'))).toBe(true);

      rabbit.state.failNextPublish = null;
      await service.processOutbox(EXCHANGE, true, 1, 5);

      expect(rabbit.published).toHaveLength(0);
    });

    test('a markSent failure after a successful publish is retried later (at-least-once)', async () => {
      build([row({ _id: 'a', messageId: 'm1' })]);
      repository.state.failMarkSent = new Error('write concern failed');

      await service.processOutbox(EXCHANGE, true, 1, 5);

      expect(rabbit.published).toHaveLength(1);
      expect(repository.state.markAttemptFailedCalls).toEqual([{ id: 'a', maxAttempts: 5 }]);
      expect(countOf('outbox_publisher_published_total')).toBe(0);
    });

    test('a claim failure ends the pass quietly', async () => {
      build([row({ _id: 'a', messageId: 'm1' })]);
      repository.state.failClaim = new Error('MongoServerSelectionError');

      await service.processOutbox(EXCHANGE, true, 1, 5);

      expect(rabbit.published).toHaveLength(0);
      expect(logLines.some((line) => line.includes('outbox claim failed'))).toBe(true);
    });

    test('an empty outbox is a no-op after the release step', async () => {
      await service.processOutbox(EXCHANGE, true, 1, 5);

      expect(repository.state.events).toEqual([`release:${EXCHANGE}`]);
      expect(counters).toEqual([]);
    });
  });

  describe('processOutbox, isSync = false (sliding window)', () => {
    test('publishes several rows concurrently up to the configured window', async () => {
      build([
        row({ _id: 'a', messageId: 'm1' }),
        row({ _id: 'b', messageId: 'm2' }),
        row({ _id: 'c', messageId: 'm3' }),
      ]);
      let inFlight = 0;
      let maxInFlight = 0;

      rabbit.publish.mockImplementation(async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
      });

      await service.processOutbox(EXCHANGE, false, 2, 5);

      expect(maxInFlight).toBe(2);
      expect(repository.state.markSentCalls).toHaveLength(3);
      expect(countOf('outbox_publisher_published_total')).toBe(3);
    });

    test('an error does not stop the pass: the remaining rows are still processed', async () => {
      build([row({ _id: 'a', messageId: 'm1' }), row({ _id: 'b', messageId: 'm2' })]);
      rabbit.state.failNextPublish = new Error('channel closed');

      await service.processOutbox(EXCHANGE, false, 1, 5);

      expect(repository.state.markSentCalls).toHaveLength(1);
      expect(repository.state.markAttemptFailedCalls).toHaveLength(1);
      expect(repository.state.rows.filter((entry) => entry.status === 'sent')).toHaveLength(1);
    });

    test('the pass waits for the whole window before it returns', async () => {
      build([row({ _id: 'a', messageId: 'm1' }), row({ _id: 'b', messageId: 'm2' })]);
      let finished = 0;

      rabbit.publish.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        finished += 1;
      });

      await service.processOutbox(EXCHANGE, false, 5, 5);

      expect(finished).toBe(2);
    });
  });
});
