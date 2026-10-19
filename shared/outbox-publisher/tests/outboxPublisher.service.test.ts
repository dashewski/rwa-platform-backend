/**
 * Unit tests for OutboxPublisherService.
 *
 * Scope: the outbox contract — a message is only marked `sent` after the
 * broker accepted it, and every failure returns the row to `pending` so the
 * next pass retries it. Repositories and the RabbitMQ client are in-memory
 * fakes; no database, no broker, no network.
 */
import './setup';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { Types } from 'mongoose';
import { OutboxPublisherService } from '../src/services/outboxPublisher.service';
import { metrics } from '@shared/monitoring/src/metrics';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import type { OutboxPublisherMessageRepository } from '../src/repositories/outboxPublisherMessage.repository';
import { asRabbitClient, createFakeRabbitClient, EXCHANGE, type FakeRabbitClient } from './fakes';

const MESSAGE_ID = '31337:0xabc:3';

type Row = {
  _id: Types.ObjectId;
  exchange: string;
  routingKey: string;
  payload: unknown;
  messageId: string;
  status: 'pending' | 'sending' | 'sent';
};

function row(overrides: Partial<Row> = {}): Row {
  return {
    _id: new Types.ObjectId(),
    exchange: EXCHANGE,
    routingKey: 'Governance_VoteCast',
    payload: { proposalId: '7' },
    messageId: MESSAGE_ID,
    status: 'pending',
    ...overrides,
  };
}

/**
 * In-memory outbox table: `pending` rows are handed out by claimNext (they
 * flip to `sending`, exactly like the atomic findOneAndUpdate does), released
 * rows go back to pending, sent rows are recorded.
 */
function createFakeOutboxRepository() {
  const state = {
    rows: [] as Row[],
    releaseSendingCalls: [] as string[],
    releaseCalls: [] as Array<Types.ObjectId | string>,
    markSentCalls: [] as Array<Types.ObjectId | string>,
    claimError: null as unknown,
    markSentError: null as unknown,
    releaseError: null as unknown,
    releaseSendingError: null as unknown,
    created: [] as unknown[],
    createResult: 'created' as 'created' | 'duplicate',
    createError: null as unknown,
  };

  const repository = {
    state,

    create: mock(async (data: Record<string, unknown>) => {
      state.created.push(data);
      if (state.createError) throw state.createError;
      return state.createResult === 'duplicate' ? null : { _id: new Types.ObjectId(), ...data };
    }),

    releaseSending: mock(async (exchange: string) => {
      state.releaseSendingCalls.push(exchange);
      if (state.releaseSendingError) throw state.releaseSendingError;
      for (const item of state.rows) {
        if (item.exchange === exchange && item.status === 'sending') item.status = 'pending';
      }
    }),

    claimNext: mock(async (exchange: string) => {
      if (state.claimError) throw state.claimError;
      const next = state.rows.find((item) => item.exchange === exchange && item.status === 'pending');
      if (!next) return null;
      next.status = 'sending';
      return next;
    }),

    markSent: mock(async (id: Types.ObjectId | string) => {
      state.markSentCalls.push(id);
      if (state.markSentError) throw state.markSentError;
      const found = state.rows.find((item) => item._id === id);
      if (found) found.status = 'sent';
    }),

    release: mock(async (id: Types.ObjectId | string) => {
      state.releaseCalls.push(id);
      if (state.releaseError) throw state.releaseError;
      const found = state.rows.find((item) => item._id === id);
      if (found) found.status = 'pending';
    }),
  };

  return repository;
}

type FakeOutboxRepository = ReturnType<typeof createFakeOutboxRepository>;

// --- spies on metrics / logger -------------------------------------------------

let counters: Array<{ name: string; labels?: Record<string, string> }> = [];
let errors: unknown[][] = [];
let originalCounter: typeof metrics.counter;
let originalError: typeof logger.error;

function captureTelemetry(): void {
  counters = [];
  errors = [];
  originalCounter = metrics.counter;
  originalError = logger.error;

  metrics.counter = ((name: string, labels?: Record<string, string>) => {
    counters.push({ name, labels });
  }) as typeof metrics.counter;

  logger.error = ((...args: unknown[]) => {
    errors.push(args);
  }) as typeof logger.error;
}

function restoreTelemetry(): void {
  metrics.counter = originalCounter;
  logger.error = originalError;
}

function counterNames(): string[] {
  return counters.map((entry) => entry.name);
}

describe('OutboxPublisherService (unit, fake repository + fake rabbit client)', () => {
  let repository: FakeOutboxRepository;
  let rabbit: FakeRabbitClient;
  let service: OutboxPublisherService;

  beforeEach(() => {
    repository = createFakeOutboxRepository();
    rabbit = createFakeRabbitClient();
    service = new OutboxPublisherService(
      asRabbitClient(rabbit),
      repository as unknown as OutboxPublisherMessageRepository,
    );
    captureTelemetry();
  });

  afterEach(() => {
    restoreTelemetry();
  });

  describe('publish (queue the event)', () => {
    test('rejects an exchange that is not registered in the client before writing anything', async () => {
      await expect(
        service.publish('nope.events', 'Governance_VoteCast', { a: 1 }, MESSAGE_ID),
      ).rejects.toMatchObject({
        statusCode: 500,
        code: 'INTERNAL_ERROR',
        message: 'Exchange "nope.events" is not registered in the RabbitMQ client',
      });

      expect(repository.state.created).toHaveLength(0);
      expect(counterNames()).toEqual([]);
    });

    test('stores the row and counts it once', async () => {
      await service.publish(EXCHANGE, 'Governance_VoteCast', { proposalId: '7' }, MESSAGE_ID);

      expect(repository.state.created).toEqual([
        { exchange: EXCHANGE, routingKey: 'Governance_VoteCast', payload: { proposalId: '7' }, messageId: MESSAGE_ID },
      ]);
      expect(counters).toEqual([{ name: 'outbox_publisher_queued_total', labels: { exchange: EXCHANGE } }]);
    });

    test('a duplicate (same event re-scanned) is accepted silently and not counted', async () => {
      repository.state.createResult = 'duplicate';

      await service.publish(EXCHANGE, 'Governance_VoteCast', { proposalId: '7' }, MESSAGE_ID);

      expect(repository.state.created).toHaveLength(1);
      expect(counterNames()).toEqual([]);
    });

    test('a storage failure propagates to the caller and is never counted as queued', async () => {
      repository.state.createError = new Error('connection 127.0.0.1:27017 closed');

      await expect(
        service.publish(EXCHANGE, 'Governance_VoteCast', { proposalId: '7' }, MESSAGE_ID),
      ).rejects.toThrow('connection 127.0.0.1:27017 closed');

      expect(counterNames()).toEqual([]);
    });
  });

  describe('processOutbox (one pass over a single exchange)', () => {
    test('starts by releasing stuck rows and stops as soon as the exchange is empty', async () => {
      await service.processOutbox(EXCHANGE);

      expect(repository.state.releaseSendingCalls).toEqual([EXCHANGE]);
      expect(rabbit.published).toHaveLength(0);
      expect(repository.state.markSentCalls).toHaveLength(0);
    });

    test('drains the whole exchange in insertion order, publishing and marking each row', async () => {
      const first = row({ routingKey: 'Governance_ProposalCreated', messageId: '31337:0x01:0' });
      const second = row({ routingKey: 'Governance_VoteCast', messageId: '31337:0x02:1' });
      const third = row({ routingKey: 'Treasury_Withdrawal', messageId: '31337:0x03:2' });
      repository.state.rows.push(first, second, third);

      await service.processOutbox(EXCHANGE);

      expect(rabbit.published.map((message) => message.routingKey)).toEqual([
        'Governance_ProposalCreated',
        'Governance_VoteCast',
        'Treasury_Withdrawal',
      ]);
      expect(rabbit.published.map((message) => message.options?.messageId)).toEqual([
        '31337:0x01:0',
        '31337:0x02:1',
        '31337:0x03:2',
      ]);
      expect(rabbit.published[0].exchange).toBe(EXCHANGE);
      expect(rabbit.published[0].payload).toEqual({ proposalId: '7' });
      expect(repository.state.markSentCalls).toEqual([first._id, second._id, third._id]);
      expect(repository.state.rows.every((item) => item.status === 'sent')).toBe(true);
      expect(counterNames().filter((name) => name === 'outbox_publisher_published_total')).toHaveLength(3);
    });

    test('leaves other exchanges untouched', async () => {
      const mine = row();
      const foreign = row({ exchange: 'other.events', messageId: 'other:1' });
      repository.state.rows.push(mine, foreign);

      await service.processOutbox(EXCHANGE);

      expect(rabbit.published).toHaveLength(1);
      expect(foreign.status).toBe('pending');
      expect(mine.status).toBe('sent');
    });

    test('a row already marked sending by a previous crash is retried in the same pass', async () => {
      const stuck = row({ status: 'sending' });
      repository.state.rows.push(stuck);

      await service.processOutbox(EXCHANGE);

      expect(repository.state.releaseSendingCalls).toEqual([EXCHANGE]);
      expect(rabbit.published).toHaveLength(1);
      expect(stuck.status).toBe('sent');
    });

    test('no route for the routing key: the row goes back to pending and the pass stops', async () => {
      const first = row({ routingKey: 'Unknown_Event', messageId: '31337:0x01:0' });
      const second = row({ routingKey: 'Governance_VoteCast', messageId: '31337:0x02:1' });
      repository.state.rows.push(first, second);
      rabbit.state.failPublishAlways = Object.assign(
        new Error('message "31337:0x01:0" was returned (312 NO_ROUTE)'),
        { name: 'AppError' },
      );

      await service.processOutbox(EXCHANGE);

      // The failing row is released, the broker never saw a markSent, and the
      // pass stops: the next pending row is not published ahead of it.
      expect(repository.state.releaseCalls).toEqual([first._id]);
      expect(repository.state.markSentCalls).toEqual([]);
      expect(counterNames().filter((name) => name === 'outbox_publisher_published_total')).toEqual([]);
      expect(first.status).toBe('pending');
      expect(second.status).toBe('pending');
      expect(errors).toHaveLength(1);
      expect(String(errors[0][0])).toContain('outbox send failed; the message stays queued');
    });

    test('a broker nack (confirm rejected) releases the row the same way', async () => {
      const failing = row();
      repository.state.rows.push(failing);
      rabbit.state.failPublishAlways = new Error('Channel closed by broker: basic.nack received');

      await service.processOutbox(EXCHANGE);

      expect(repository.state.releaseCalls).toEqual([failing._id]);
      expect(failing.status).toBe('pending');
    });

    test('a closed channel / connection loss releases the row instead of losing it', async () => {
      const failing = row();
      repository.state.rows.push(failing);
      rabbit.state.failPublishAlways = new Error('RabbitMQ channel is not connected');

      await service.processOutbox(EXCHANGE);

      expect(repository.state.releaseCalls).toEqual([failing._id]);
      expect(failing.status).toBe('pending');
      expect(repository.state.markSentCalls).toEqual([]);
    });

    test('a publish timeout (no confirm within the deadline) releases the row', async () => {
      const failing = row();
      repository.state.rows.push(failing);
      rabbit.state.failPublishAlways = new Error('publish was not confirmed within 1000 ms');

      await service.processOutbox(EXCHANGE);

      expect(repository.state.releaseCalls).toEqual([failing._id]);
      expect(failing.status).toBe('pending');
    });

    test('a successful publish whose markSent fails is released and not counted as published', async () => {
      const failing = row();
      repository.state.rows.push(failing);
      repository.state.markSentError = new Error('primary stepped down');

      await service.processOutbox(EXCHANGE);

      expect(rabbit.published).toHaveLength(1);
      expect(repository.state.releaseCalls).toEqual([failing._id]);
      expect(counterNames().filter((name) => name === 'outbox_publisher_published_total')).toEqual([]);
      expect(failing.status).toBe('pending');
      expect(errors).toHaveLength(1);
    });

    test('when the release itself fails the pass still stops quietly (the row stays sending)', async () => {
      const failing = row();
      repository.state.rows.push(failing);
      rabbit.state.failPublishAlways = new Error('RabbitMQ channel is not connected');
      repository.state.releaseError = new Error('MongoServerSelectionError: server selection timed out');

      await service.processOutbox(EXCHANGE);

      expect(repository.state.releaseCalls).toEqual([failing._id]);
      expect(failing.status).toBe('sending');
      expect(errors).toHaveLength(1);
    });

    test('a claim failure ends the pass after the release sweep without publishing anything', async () => {
      repository.state.rows.push(row());
      repository.state.claimError = new Error('MongoNetworkError: connection lost');

      await service.processOutbox(EXCHANGE);

      expect(repository.state.releaseSendingCalls).toEqual([EXCHANGE]);
      expect(rabbit.published).toHaveLength(0);
      expect(errors).toHaveLength(1);
      expect(String(errors[0][0])).toContain('outbox claim failed');
      expect(repository.state.rows[0].status).toBe('pending');
    });

    test('a releaseSending failure ends the pass (nothing is claimed)', async () => {
      repository.state.rows.push(row());
      repository.state.releaseSendingError = new Error('not primary');

      await expect(service.processOutbox(EXCHANGE)).rejects.toThrow('not primary');
      expect(rabbit.published).toHaveLength(0);
    });

    test('two consecutive passes send nothing twice once the exchange is drained', async () => {
      repository.state.rows.push(row());

      await service.processOutbox(EXCHANGE);
      await service.processOutbox(EXCHANGE);

      expect(rabbit.published).toHaveLength(1);
      expect(repository.state.markSentCalls).toHaveLength(1);
    });
  });
});
