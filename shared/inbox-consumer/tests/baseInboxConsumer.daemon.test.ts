/**
 * Unit tests for BaseInboxConsumerDaemon — the delivery pipeline of the inbox.
 *
 * Both the RabbitMQ client and the consumer service are fakes: the client hands
 * the test the very callback it received from consume(), so a "delivery" is a
 * plain function call. The daemon owns: subscriptions and prefetch, ack on
 * success, nack (retry queue) on exhaustion, park after `parkAfterCycles`
 * retry cycles, per-queue serialization for `isSync` queues, and shutdown.
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

type Handler = (event: any) => Promise<void>;
type Routing = Record<string, { prefetch: number; isSync: boolean; handlers: Record<string, Handler> }>;

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

/** The daemon is abstract: the test subclass injects a plain routing object. */
class TestInboxDaemon extends BaseInboxConsumerDaemon {
  constructor(rabbit: FakeRabbitClient, service: FakeConsumerService, routing: Routing) {
    super(asRabbitClient(rabbit) as never, asConsumerService(service), routing as never);
  }
}

let logLines: string[] = [];
let counters: Array<{ name: string; labels?: Record<string, string> }> = [];
const original = {
  info: logger.info,
  warn: logger.warn,
  error: logger.error,
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
  metrics.counter = ((name: string, labels?: Record<string, string>) => {
    counters.push({ name, labels });
  }) as typeof metrics.counter;
}

function restoreTelemetry(): void {
  logger.info = original.info;
  logger.warn = original.warn;
  logger.error = original.error;
  metrics.counter = original.counter;
}

describe('BaseInboxConsumerDaemon (unit, fake client + fake service)', () => {
  let rabbit: FakeRabbitClient;
  let service: FakeConsumerService;
  let handlers: Record<string, Handler>;
  let routing: Routing;
  let daemon: TestInboxDaemon;

  beforeEach(() => {
    rabbit = createFakeRabbitClient();
    service = createFakeConsumerService();
    handlers = {
      Governance_VoteCast: mock(async (_event: any): Promise<void> => undefined),
      Governance_ProposalCreated: mock(async (_event: any): Promise<void> => undefined),
      Something_Else: mock(async (_event: any): Promise<void> => undefined),
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
    await consumerHandler(message);
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

    test('a delivery reaches the handler of the queue it was delivered on', async () => {
      await daemon.initialize();

      await deliver(QUEUE, makeMessage('Governance_VoteCast', { proposalId: '7' }));

      expect(handlers.Governance_VoteCast).toHaveBeenCalledTimes(1);
      expect(handlers.Governance_VoteCast).toHaveBeenCalledWith({ proposalId: '7' });
    });

    test('a queue that fails to subscribe rejects initialize after the earlier queues were subscribed', async () => {
      rabbit.state.failConsumeFor = OTHER_QUEUE;

      await expect(daemon.initialize()).rejects.toThrow("NOT_FOUND - no queue 'blockchain.events.other' in vhost '/'");
      expect(rabbit.state.consumerTags).toHaveLength(1);
    });

    test('the delivery carries the queue deferAfterAttempts into the service', async () => {
      rabbit.state.deferAfterAttempts.set(QUEUE, 3);
      await daemon.initialize();

      await deliver(QUEUE, makeMessage('Governance_VoteCast', {}));

      expect(service.handle.mock.calls[0][3]).toBe(3);
      expect(rabbit.getQueueDeferAfterAttempts).toHaveBeenCalledWith(QUEUE);
    });
  });

  describe('delivery outcome: acked', () => {
    test('a processed message is acked once and nothing else happens', async () => {
      await daemon.initialize();

      await deliver(QUEUE, makeMessage('Governance_VoteCast', { proposalId: '7' }));

      expect(rabbit.state.acked).toHaveLength(1);
      expect(rabbit.state.nacked).toHaveLength(0);
      expect(rabbit.state.parked).toHaveLength(0);
      expect(service.state.handles).toHaveLength(1);
      expect(service.state.handles[0].queueName).toBe(QUEUE);
    });

    test('a failing ack propagates out of the delivery (the broker will redeliver)', async () => {
      await daemon.initialize();
      rabbit.state.failAck = new Error('IllegalOperationError: Channel closed');

      await expect(deliver(QUEUE, makeMessage('Governance_VoteCast', {}))).rejects.toThrow('Channel closed');

      expect(rabbit.state.nacked).toHaveLength(0);
    });

    test('an unexpected rejection from the service leaves the message unacked', async () => {
      await daemon.initialize();
      service.state.throwFromHandle = new Error('service exploded');

      await expect(deliver(QUEUE, makeMessage('Governance_VoteCast', {}))).rejects.toThrow('service exploded');

      expect(rabbit.state.acked).toHaveLength(0);
      expect(rabbit.state.nacked).toHaveLength(0);
    });
  });

  describe('delivery outcome: deferred (retry queue)', () => {
    test('an exhausted delivery is nacked into the retry queue (requeue=false)', async () => {
      await daemon.initialize();
      service.state.nextOutcome = 'deferred';

      await deliver(QUEUE, makeMessage('Governance_VoteCast', {}));

      expect(rabbit.state.nacked).toHaveLength(1);
      expect(rabbit.state.nacked[0].requeue).toBe(false);
      expect(rabbit.state.acked).toHaveLength(0);
      expect(rabbit.state.parked).toHaveLength(0);
    });

    test('a failing nack is logged and does not break the daemon', async () => {
      await daemon.initialize();
      service.state.nextOutcome = 'deferred';
      rabbit.state.failNack = new Error('IllegalOperationError: Channel closed');

      await deliver(QUEUE, makeMessage('Governance_VoteCast', {}));

      expect(logLines.some((line) => line.includes('failed to hand the message to the retry queue'))).toBe(true);
    });

    test('with infinite parkAfterCycles the message is always nacked, never parked', async () => {
      await daemon.initialize();
      service.state.nextOutcome = 'deferred';

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
      rabbit.state.parkAfterCycles.set(QUEUE, 2);
      await daemon.initialize();
      service.state.nextOutcome = 'deferred';

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
      expect(rabbit.state.nacked).toHaveLength(0);
      expect(counters).toEqual([{ name: 'inbox_consumer_parked_total', labels: { queue: QUEUE } }]);
      expect(logLines.some((line) => line.includes('parked after 2 retry cycles'))).toBe(true);
    });

    test('below the threshold the message is still nacked, not parked', async () => {
      rabbit.state.parkAfterCycles.set(QUEUE, 3);
      await daemon.initialize();
      service.state.nextOutcome = 'deferred';

      await deliver(
        QUEUE,
        makeMessage('Governance_VoteCast', {}, { headers: { 'x-death': [xDeathEntry(`${QUEUE}.retry`, 'expired', 2)] } }),
      );

      expect(rabbit.state.parked).toHaveLength(0);
      expect(rabbit.state.nacked).toHaveLength(1);
    });

    test('a failing park hands the message back to the retry queue instead of losing it', async () => {
      rabbit.state.parkAfterCycles.set(QUEUE, 1);
      await daemon.initialize();
      service.state.nextOutcome = 'deferred';
      rabbit.state.failPark = new Error('IllegalOperationError: Channel closed');

      await deliver(
        QUEUE,
        makeMessage('Governance_VoteCast', {}, { headers: { 'x-death': [xDeathEntry(`${QUEUE}.retry`, 'expired', 1)] } }),
      );

      expect(rabbit.state.acked).toHaveLength(0);
      expect(rabbit.state.nacked).toHaveLength(1);
      expect(rabbit.state.nacked[0].requeue).toBe(false);
      expect(logLines.some((line) => line.includes('failed to park messageId'))).toBe(true);
    });

    test('deaths of other queues and non-expired reasons are not counted as retry cycles', async () => {
      rabbit.state.parkAfterCycles.set(QUEUE, 3);
      await daemon.initialize();
      service.state.nextOutcome = 'deferred';

      await deliver(
        QUEUE,
        makeMessage(
          'Governance_VoteCast',
          {},
          {
            headers: {
              'x-death': [
                xDeathEntry(`${QUEUE}.retry`, 'rejected', 9),
                xDeathEntry('some.other.queue', 'expired', 9),
                xDeathEntry(QUEUE, 'rejected', 9),
              ],
            },
          },
        ),
      );

      expect(rabbit.state.parked).toHaveLength(0);
      expect(rabbit.state.nacked).toHaveLength(1);
    });

    test('deaths given as plain objects (not key/value pairs) are understood too', async () => {
      rabbit.state.parkAfterCycles.set(QUEUE, 1);
      await daemon.initialize();
      service.state.nextOutcome = 'deferred';

      await deliver(
        QUEUE,
        makeMessage(
          'Governance_VoteCast',
          {},
          { headers: { 'x-death': [{ queue: `${QUEUE}.retry`, reason: 'expired', count: 3 }] } },
        ),
      );

      expect(rabbit.state.parked).toHaveLength(1);
    });

    test('a message that is not valid JSON cannot be parked: park throws, the message is nacked', async () => {
      rabbit.state.parkAfterCycles.set(QUEUE, 1);
      await daemon.initialize();
      service.state.nextOutcome = 'deferred';

      await deliver(
        QUEUE,
        makeMessage('Governance_VoteCast', {}, { raw: 'not-json{', headers: { 'x-death': [xDeathEntry(`${QUEUE}.retry`, 'expired', 1)] } }),
      );

      expect(rabbit.state.parked).toHaveLength(0);
      expect(rabbit.state.nacked).toHaveLength(1);
      expect(logLines.some((line) => line.includes('failed to park messageId'))).toBe(true);
    });
  });

  describe('processMessage payload handling', () => {
    test('an unknown routing key is warned about and the message is acked (dropped)', async () => {
      await daemon.initialize();

      await deliver(QUEUE, makeMessage('Unknown_Event', { a: 1 }));

      expect(Object.values(handlers).every((handler) => handler.mock.calls.length === 0)).toBe(true);
      expect(logLines.some((line) => line.includes('no handler registered for Unknown_Event'))).toBe(true);
      expect(rabbit.state.acked).toHaveLength(1);
    });

    test('a payload that is not valid JSON is logged with the body head and never reaches a handler', async () => {
      await daemon.initialize();
      service.state.nextOutcome = 'deferred';

      await deliver(QUEUE, makeMessage('Governance_VoteCast', {}, { raw: 'not-json{' }));

      expect(handlers.Governance_VoteCast).not.toHaveBeenCalled();
      const logged = logLines.find((line) => line.includes('payload is not valid JSON'))!;
      expect(logged).toContain('routingKey "Governance_VoteCast"');
      expect(logged).toContain('messageId "31337:0xabc:3"');
      expect(logged).toContain('body: not-json{');
      expect(rabbit.state.nacked).toHaveLength(1);
    });

    test('a message without messageId is still processed (the dedup guard lives in the service)', async () => {
      await daemon.initialize();

      await deliver(QUEUE, makeMessage('Governance_VoteCast', { a: 1 }, { messageId: null }));

      expect(handlers.Governance_VoteCast).toHaveBeenCalledWith({ a: 1 });
      expect(rabbit.state.acked).toHaveLength(1);
    });

    test('a null message (consumer cancelled by the broker) is ignored', async () => {
      await daemon.initialize();
      const consumerHandler = rabbit.state.handlers.get(QUEUE)!;

      await consumerHandler(null);

      expect(service.state.handles).toEqual([]);
      expect(rabbit.state.acked).toEqual([]);
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

      handlers.Governance_VoteCast.mockImplementation(async (event: any) => {
        order.push(`start:${event.n}`);
        if (event.n === 1) await gate;
        order.push(`end:${event.n}`);
      });

      const first = deliver(QUEUE, makeMessage('Governance_VoteCast', { n: 1 }));
      const second = deliver(QUEUE, makeMessage('Governance_VoteCast', { n: 2 }));

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

      handlers.Something_Else.mockImplementation(async (event: any) => {
        order.push(`start:${event.n}`);
        await gate;
        order.push(`end:${event.n}`);
      });

      const first = deliver(OTHER_QUEUE, makeMessage('Something_Else', { n: 1 }));
      const second = deliver(OTHER_QUEUE, makeMessage('Something_Else', { n: 2 }));

      await waitFor(() => order.length === 2);
      expect(order).toEqual(['start:1', 'start:2']);

      release();
      await Promise.all([first, second]);
    });

    test('queues are independent: a slow delivery on one does not block another', async () => {
      await daemon.initialize();
      let releaseSlow: () => void = () => undefined;
      const slowGate = new Promise<void>((resolve) => {
        releaseSlow = resolve;
      });
      handlers.Governance_VoteCast.mockImplementation(async () => {
        await slowGate;
      });

      const slow = deliver(QUEUE, makeMessage('Governance_VoteCast', {}));
      await deliver(OTHER_QUEUE, makeMessage('Something_Else', { value: 1 }));

      expect(handlers.Something_Else).toHaveBeenCalledTimes(1);
      releaseSlow();
      await slow;
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

    test('stop before initialize is a no-op', async () => {
      await daemon.stop();

      expect(rabbit.state.cancelled).toEqual([]);
    });

    test('a cancel failure during stop rejects the stop call (documented behaviour)', async () => {
      await daemon.initialize();
      rabbit.state.failCancel = new Error('IllegalOperationError: Channel closed');

      await expect(daemon.stop()).rejects.toThrow('Channel closed');

      rabbit.state.failCancel = null;
    });
  });
});
