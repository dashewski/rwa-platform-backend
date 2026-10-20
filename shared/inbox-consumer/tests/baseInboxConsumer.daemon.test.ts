/**
 * Unit tests for BaseInboxConsumerDaemon — the delivery pipeline of the inbox.
 *
 * Both the RabbitMQ client and the consumer service are fakes: the client hands
 * the test the very callback it received from consume(), so a "delivery" is a
 * plain function call. The daemon owns: subscriptions and prefetch, the retry
 * loop with backoff, the duplicate decision (marker in the inbox), ack on
 * success, nack (retry queue) on exhaustion, park after `parkAfterCycles` retry
 * cycles, per-queue serialization for `isSync` queues, and shutdown.
 */
import './setup';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { ConsumeMessage } from 'amqplib';
import { BaseInboxConsumerDaemon } from '../src/daemons/baseInboxConsumer.daemon';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { metrics } from '@shared/monitoring/src/metrics';
import {
  asConsumerService,
  asRabbitClient,
  createFakeConsumerService,
  createFakeRabbitClient,
  makeMessage,
  QUEUE,
  xDeathEntry,
  type FakeConsumerService,
  type FakeRabbitClient,
} from './fakes';

const OTHER_QUEUE = 'blockchain.events.other';

type Handler = (event: any, commitInbox: () => Promise<void>) => Promise<void>;
/** The routing table is assembled from bun mocks, so their inspection API stays visible. */
type HandlerMock = ReturnType<typeof mock<Handler>>;
type Routing = Record<string, { prefetch: number; isSync: boolean; handlers: Record<string, Handler> }>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error('waitFor: condition was not met in time');
    await sleep(2);
  }
}

/** The daemon is abstract: the test subclass injects a plain routing object. */
class TestInboxDaemon extends BaseInboxConsumerDaemon {
  constructor(rabbit: FakeRabbitClient, service: FakeConsumerService, routing: Routing, delayMs = 1) {
    super(asRabbitClient(rabbit) as never, asConsumerService(service), routing as never, delayMs, delayMs * 5);
  }
}

let logLines: string[] = [];
let counters: Array<{ name: string; labels?: Record<string, string> }> = [];
const original = {
  info: logger.info,
  warn: logger.warn,
  error: logger.error,
  debug: logger.debug,
  counter: metrics.counter,
};

function captureTelemetry(): void {
  logLines = [];
  counters = [];

  logger.info = ((...args: unknown[]) => {
    logLines.push(args.map(String).join(' '));
  }) as typeof logger.info;
  logger.warn = ((...args: unknown[]) => {
    logLines.push(args.map(String).join(' '));
  }) as typeof logger.warn;
  logger.error = ((...args: unknown[]) => {
    logLines.push(args.map(String).join(' '));
  }) as typeof logger.error;
  logger.debug = ((...args: unknown[]) => {
    logLines.push(args.map(String).join(' '));
  }) as typeof logger.debug;
  metrics.counter = ((name: string, labels?: Record<string, string>) => {
    counters.push({ name, labels });
  }) as typeof metrics.counter;
}

function restoreTelemetry(): void {
  logger.info = original.info;
  logger.warn = original.warn;
  logger.error = original.error;
  logger.debug = original.debug;
  metrics.counter = original.counter;
}

const names = (): string[] => counters.map((entry) => entry.name);
const countOf = (name: string): number => names().filter((entry) => entry === name).length;

describe('BaseInboxConsumerDaemon (unit, fake client + fake service)', () => {
  let rabbit: FakeRabbitClient;
  let service: FakeConsumerService;
  let handlers: Record<string, HandlerMock>;
  let routing: Routing;
  let daemon: TestInboxDaemon;

  beforeEach(() => {
    rabbit = createFakeRabbitClient();
    service = createFakeConsumerService();
    handlers = {
      Governance_VoteCast: mock(async (_event: any, commitInbox: () => Promise<void>): Promise<void> => {
        await commitInbox();
      }),
      Governance_ProposalCreated: mock(async (_event: any, commitInbox: () => Promise<void>): Promise<void> => {
        await commitInbox();
      }),
      Something_Else: mock(async (_event: any, commitInbox: () => Promise<void>): Promise<void> => {
        await commitInbox();
      }),
    };
    routing = {
      [QUEUE]: {
        prefetch: 1,
        isSync: true,
        handlers: {
          Governance_VoteCast: handlers.Governance_VoteCast,
          Governance_ProposalCreated: handlers.Governance_ProposalCreated,
        },
      },
      [OTHER_QUEUE]: { prefetch: 3, isSync: false, handlers: { Something_Else: handlers.Something_Else } },
    };
    daemon = new TestInboxDaemon(rabbit, service, routing);
    captureTelemetry();
  });

  afterEach(async () => {
    await daemon.stop();
    restoreTelemetry();
  });

  async function deliver(queue: string, message: ConsumeMessage): Promise<void> {
    const consumerHandler = rabbit.state.handlers.get(queue);
    if (!consumerHandler) throw new Error(`the daemon never subscribed to ${queue}`);

    const settled = rabbit.state.acked.length + rabbit.state.nacked.length + rabbit.state.parked.length;
    await consumerHandler(message);

    // A parallel queue does not await its deliveries: wait for the outcome.
    await waitFor(() => rabbit.state.acked.length + rabbit.state.nacked.length + rabbit.state.parked.length > settled);
  }

  describe('initialize / subscribe', () => {
    test('subscribes to every queue of the routing with its own prefetch', async () => {
      await daemon.initialize();

      expect(rabbit.state.consumedOptions).toEqual([
        { queue: QUEUE, options: { prefetch: 1 } },
        { queue: OTHER_QUEUE, options: { prefetch: 3 } },
      ]);
      expect(logLines.some((line) => line.includes(`Inbox consumer subscribed to ${QUEUE}`))).toBe(true);
    });

    test('a queue that fails to subscribe rejects initialize after the earlier queues were subscribed', async () => {
      rabbit.state.failConsumeFor = OTHER_QUEUE;

      await expect(daemon.initialize()).rejects.toThrow("NOT_FOUND - no queue 'blockchain.events.other' in vhost '/'");
      expect(rabbit.state.consumerTags).toHaveLength(1);
    });
  });

  describe('delivery routing', () => {
    test('a delivery reaches the handler of the queue it was delivered on', async () => {
      await daemon.initialize();

      await deliver(QUEUE, makeMessage('Governance_VoteCast', { proposalId: '7' }));

      expect(handlers.Governance_VoteCast).toHaveBeenCalledTimes(1);
      expect(handlers.Governance_VoteCast.mock.calls[0][0]).toEqual({ proposalId: '7' });
      expect(handlers.Governance_ProposalCreated).not.toHaveBeenCalled();
    });

    test('the handler gets a commitInbox closure bound to the message id', async () => {
      await daemon.initialize();

      await deliver(QUEUE, makeMessage('Governance_VoteCast', {}));

      expect(service.state.commits).toEqual(['31337:0xabc:3']);
    });

    test('an unknown routing key is warned about and acked without touching a handler', async () => {
      await daemon.initialize();

      await deliver(QUEUE, makeMessage('Unknown_Event', { a: 1 }));

      expect(Object.values(handlers).every((handler) => handler.mock.calls.length === 0)).toBe(true);
      expect(logLines.some((line) => line.includes('no handler registered for Unknown_Event'))).toBe(true);
      expect(rabbit.state.acked).toHaveLength(1);
      expect(service.state.commits).toEqual([]);
    });

    test('a payload that is not valid JSON is logged with the body head and never reaches a handler', async () => {
      rabbit.state.deferAfterAttempts.set(QUEUE, 1);
      await daemon.initialize();

      await deliver(QUEUE, makeMessage('Governance_VoteCast', {}, { raw: 'not-json{' }));

      expect(handlers.Governance_VoteCast).not.toHaveBeenCalled();
      const logged = logLines.find((line) => line.includes('payload is not valid JSON'))!;
      expect(logged).toContain('routingKey "Governance_VoteCast"');
      expect(logged).toContain('messageId "31337:0xabc:3"');
      expect(logged).toContain('body: not-json{');
      expect(rabbit.state.nacked).toHaveLength(1);
      expect(rabbit.state.nacked[0].requeue).toBe(false);
    });

    test('a message without messageId is retried and then deferred (the inbox cannot deduplicate it)', async () => {
      rabbit.state.deferAfterAttempts.set(QUEUE, 2);
      await daemon.initialize();

      await deliver(QUEUE, makeMessage('Governance_VoteCast', {}, { messageId: null }));

      expect(handlers.Governance_VoteCast).not.toHaveBeenCalled();
      expect(service.state.commits).toEqual([]);
      expect(countOf('inbox_consumer_retries_total')).toBe(2);
      expect(countOf('inbox_consumer_deferred_total')).toBe(1);
      expect(rabbit.state.nacked).toHaveLength(1);
      expect(logLines.some((line) => line.includes('the message has no messageId'))).toBe(true);
    });
  });

  describe('delivery outcome: acked', () => {
    test('a committed message is acked once and counted as processed', async () => {
      await daemon.initialize();

      await deliver(QUEUE, makeMessage('Governance_VoteCast', { proposalId: '7' }));

      expect(rabbit.state.acked).toHaveLength(1);
      expect(rabbit.state.nacked).toHaveLength(0);
      expect(rabbit.state.parked).toHaveLength(0);
      expect(names()).toEqual(['inbox_consumer_processed_total']);
    });

    test('a marker stored by an earlier delivery skips the handler and acks (pre-read)', async () => {
      service.state.preexisting.add('31337:0xabc:3');
      await daemon.initialize();

      await deliver(QUEUE, makeMessage('Governance_VoteCast', {}));

      expect(handlers.Governance_VoteCast).not.toHaveBeenCalled();
      expect(service.state.reads).toEqual(['31337:0xabc:3']);
      expect(rabbit.state.acked).toHaveLength(1);
      expect(names()).toEqual(['inbox_consumer_duplicates_total']);
    });

    test('a failing ack propagates out of the sync delivery (the broker will redeliver)', async () => {
      await daemon.initialize();
      rabbit.state.failAck = new Error('IllegalOperationError: Channel closed');

      const handler = rabbit.state.handlers.get(QUEUE)!;
      await expect(handler(makeMessage('Governance_VoteCast', {}))).rejects.toThrow('Channel closed');
      expect(rabbit.state.nacked).toHaveLength(0);
    });
  });

  describe('delivery outcome: duplicate', () => {
    test('a commit rejected as a duplicate acks the delivery without retries', async () => {
      service.state.commitOutcomes = ['duplicate'];
      service.state.preexisting.add('31337:0xabc:3');
      // The pre-read must miss the marker, otherwise the handler never runs.
      service.isCommitted.mockImplementationOnce(async () => false);
      await daemon.initialize();

      await deliver(QUEUE, makeMessage('Governance_VoteCast', {}));

      expect(rabbit.state.acked).toHaveLength(1);
      expect(rabbit.state.nacked).toHaveLength(0);
      expect(countOf('inbox_consumer_duplicates_total')).toBe(1);
      expect(countOf('inbox_consumer_retries_total')).toBe(0);
      expect(logLines.some((line) => line.includes('the inbox marker already stored'))).toBe(true);
    });
  });

  describe('delivery outcome: deferred (retry queue)', () => {
    test('an exhausted delivery is nacked into the retry queue (requeue=false)', async () => {
      rabbit.state.deferAfterAttempts.set(QUEUE, 2);
      handlers.Governance_VoteCast.mockImplementation(async () => {
        throw new Error('db write failed inside the handler');
      });
      await daemon.initialize();

      await deliver(QUEUE, makeMessage('Governance_VoteCast', {}));

      expect(rabbit.state.nacked).toHaveLength(1);
      expect(rabbit.state.nacked[0].requeue).toBe(false);
      expect(rabbit.state.acked).toHaveLength(0);
      expect(countOf('inbox_consumer_retries_total')).toBe(2);
      expect(countOf('inbox_consumer_deferred_total')).toBe(1);
      expect(logLines.some((line) => line.includes('db write failed inside the handler'))).toBe(true);
    });

    test('a handler that returns without committing is treated as a failure and retried', async () => {
      rabbit.state.deferAfterAttempts.set(QUEUE, 2);
      handlers.Governance_VoteCast.mockImplementation(async () => undefined);
      await daemon.initialize();

      await deliver(QUEUE, makeMessage('Governance_VoteCast', {}));

      expect(service.state.commits).toEqual([]);
      expect(countOf('inbox_consumer_retries_total')).toBe(2);
      expect(rabbit.state.nacked).toHaveLength(1);
      expect(logLines.some((line) => line.includes('without committing the inbox marker'))).toBe(true);
    });

    test('a failed marker read does not turn a failure into a duplicate', async () => {
      rabbit.state.deferAfterAttempts.set(QUEUE, 2);
      handlers.Governance_VoteCast.mockImplementation(async () => {
        throw new Error('handler failed');
      });
      service.state.readError = new Error('MongoServerSelectionError: server selection timed out');
      await daemon.initialize();

      await deliver(QUEUE, makeMessage('Governance_VoteCast', {}));

      expect(rabbit.state.acked).toHaveLength(0);
      expect(countOf('inbox_consumer_retries_total')).toBe(2);
      expect(logLines.some((line) => line.includes('failed to read the inbox marker'))).toBe(true);
    });

    test('a failing nack is logged and does not break the daemon', async () => {
      rabbit.state.deferAfterAttempts.set(QUEUE, 1);
      handlers.Governance_VoteCast.mockImplementation(async () => {
        throw new Error('handler failed');
      });
      rabbit.state.failNack = new Error('IllegalOperationError: Channel closed');
      await daemon.initialize();

      await deliver(QUEUE, makeMessage('Governance_VoteCast', {}));

      expect(logLines.some((line) => line.includes('failed to hand the message to the retry queue'))).toBe(true);
    });

    test('with infinite parkAfterCycles the message is always nacked, never parked', async () => {
      rabbit.state.deferAfterAttempts.set(QUEUE, 1);
      handlers.Governance_VoteCast.mockImplementation(async () => {
        throw new Error('handler failed');
      });
      await daemon.initialize();

      await deliver(
        QUEUE,
        makeMessage('Governance_VoteCast', {}, { headers: { 'x-death': [xDeathEntry(`${QUEUE}.retry`, 'expired', 99)] } }),
      );

      expect(rabbit.state.parked).toHaveLength(0);
      expect(rabbit.state.nacked).toHaveLength(1);
    });
  });

  describe('park', () => {
    test('after parkAfterCycles retry cycles the message is published to <queue>.parked and acked', async () => {
      rabbit.state.deferAfterAttempts.set(QUEUE, 1);
      rabbit.state.parkAfterCycles.set(QUEUE, 2);
      handlers.Governance_VoteCast.mockImplementation(async () => {
        throw new Error('handler failed');
      });
      await daemon.initialize();

      await deliver(
        QUEUE,
        makeMessage(
          'Governance_VoteCast',
          { proposalId: '7' },
          { headers: { 'x-death': [xDeathEntry(`${QUEUE}.retry`, 'expired', 2)] } },
        ),
      );

      expect(rabbit.state.parked).toEqual([
        { queue: `${QUEUE}.parked`, payload: { proposalId: '7' }, messageId: '31337:0xabc:3' },
      ]);
      expect(rabbit.state.acked).toHaveLength(1);
      expect(countOf('inbox_consumer_parked_total')).toBe(1);
    });

    test('a failing park hands the message back to the retry queue', async () => {
      rabbit.state.deferAfterAttempts.set(QUEUE, 1);
      rabbit.state.parkAfterCycles.set(QUEUE, 1);
      handlers.Governance_VoteCast.mockImplementation(async () => {
        throw new Error('handler failed');
      });
      rabbit.state.failPark = new Error('channel closed');
      await daemon.initialize();

      await deliver(
        QUEUE,
        makeMessage(
          'Governance_VoteCast',
          {},
          { headers: { 'x-death': [xDeathEntry(`${QUEUE}.retry`, 'expired', 1)] } },
        ),
      );

      expect(rabbit.state.acked).toHaveLength(0);
      expect(rabbit.state.nacked).toHaveLength(1);
      expect(logLines.some((line) => line.includes('failed to park'))).toBe(true);
    });
  });

  describe('serialization', () => {
    test('messages of an isSync queue are processed strictly one after another', async () => {
      await daemon.initialize();
      const order: string[] = [];
      let releaseFirst: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });

      handlers.Governance_VoteCast.mockImplementation(async (event: any, commitInbox: () => Promise<void>) => {
        order.push(`start:${event.n}`);
        if (event.n === 1) await gate;
        await commitInbox();
        order.push(`end:${event.n}`);
      });

      const consumerHandler = rabbit.state.handlers.get(QUEUE)!;
      const first = consumerHandler(makeMessage('Governance_VoteCast', { n: 1 }));
      const second = consumerHandler(makeMessage('Governance_VoteCast', { n: 2 }, { messageId: 'msg-2' }));

      await waitFor(() => order.includes('start:1'));
      expect(order).toEqual(['start:1']);

      releaseFirst();
      await Promise.all([first, second]);

      expect(order).toEqual(['start:1', 'end:1', 'start:2', 'end:2']);
    });

    test('a parallel (isSync=false) queue processes deliveries concurrently', async () => {
      await daemon.initialize();
      const order: string[] = [];
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });

      handlers.Something_Else.mockImplementation(async (event: any, commitInbox: () => Promise<void>) => {
        order.push(`start:${event.n}`);
        await gate;
        await commitInbox();
        order.push(`end:${event.n}`);
      });

      const consumerHandler = rabbit.state.handlers.get(OTHER_QUEUE)!;
      const first = consumerHandler(makeMessage('Something_Else', { n: 1 }));
      const second = consumerHandler(makeMessage('Something_Else', { n: 2 }));

      await waitFor(() => order.length === 2);
      expect(order).toEqual(['start:1', 'start:2']);

      release();
      await Promise.all([first, second]);
    });
  });

  describe('stop', () => {
    test('with a live connection every consumer is cancelled', async () => {
      await daemon.initialize();

      await daemon.stop();

      expect(rabbit.state.cancelled).toHaveLength(2);
      expect(logLines.some((line) => line.includes(`Inbox consumer "${QUEUE}" stopped`))).toBe(true);
    });

    test('without a connection nothing is cancelled (the broker already dropped the consumers)', async () => {
      await daemon.initialize();
      rabbit.state.connected = false;

      await daemon.stop();

      expect(rabbit.state.cancelled).toEqual([]);
    });

    test('stop is idempotent: the second call cancels nothing', async () => {
      await daemon.initialize();

      await daemon.stop();
      await daemon.stop();

      expect(rabbit.state.cancelled).toHaveLength(2);
    });
  });
});
