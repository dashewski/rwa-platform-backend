/**
 * Unit tests for BaseInboxConsumerDaemon — the delivery pipeline of the inbox.
 *
 * Both the RabbitMQ client and the consumer service are fakes: the client hands
 * the test the very callback it received from consume(), so a "delivery" is a
 * plain function call. What is pinned down here is everything the daemon owns:
 * which queues it subscribes to with which prefetch, when a message is acked,
 * what happens on a halt (probe armed, consumer cancelled, message requeued),
 * the strict per-queue serialization, and how shutdown behaves with and
 * without a live connection.
 */
import './setup';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { ConsumeMessage } from 'amqplib';
import { BaseInboxConsumerDaemon } from '../src/daemons/baseInboxConsumer.daemon';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import {
  asConsumerService,
  asRabbitClient,
  createFakeConsumerService,
  createFakeRabbitClient,
  makeMessage,
  QUEUE,
  type FakeConsumerService,
  type FakeRabbitClient,
} from './fakes';

const OTHER_QUEUE = 'blockchain.events.other';
const PROBE_MS = 20;

type Handler = (event: any) => Promise<void>;

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
  constructor(
    rabbit: FakeRabbitClient,
    service: FakeConsumerService,
    routing: Record<string, { prefetch: number; handlers: Record<string, Handler> }>,
    probeMs: number = PROBE_MS,
  ) {
    super(asRabbitClient(rabbit) as never, asConsumerService(service), routing as never, probeMs);
  }
}

let logLines: string[] = [];
let originalInfo: typeof logger.info;
let originalWarn: typeof logger.warn;
let originalError: typeof logger.error;

function captureLogs(): void {
  logLines = [];
  originalInfo = logger.info;
  originalWarn = logger.warn;
  originalError = logger.error;
  logger.info = ((...args: unknown[]) => {
    logLines.push(args.map(String).join(' '));
  }) as typeof logger.info;
  logger.warn = ((...args: unknown[]) => {
    logLines.push(args.map(String).join(' '));
  }) as typeof logger.warn;
  logger.error = ((...args: unknown[]) => {
    logLines.push(args.map(String).join(' '));
  }) as typeof logger.error;
}

function restoreLogs(): void {
  logger.info = originalInfo;
  logger.warn = originalWarn;
  logger.error = originalError;
}

describe('BaseInboxConsumerDaemon (unit, fake client + fake service)', () => {
  let rabbit: FakeRabbitClient;
  let service: FakeConsumerService;
  let handlers: Record<string, Handler>;
  let routing: Record<string, { prefetch: number; handlers: Record<string, Handler> }>;
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
      [QUEUE]: { prefetch: 1, handlers: { Governance_VoteCast: handlers.Governance_VoteCast, Governance_ProposalCreated: handlers.Governance_ProposalCreated } },
      [OTHER_QUEUE]: { prefetch: 3, handlers: { Something_Else: handlers.Something_Else } },
    };
    daemon = new TestInboxDaemon(rabbit, service, routing);
    captureLogs();
  });

  afterEach(async () => {
    await daemon.stop();
    restoreLogs();
  });

  /** Delivers a message through the callback consume() received. */
  async function deliver(queue: string, message: ConsumeMessage): Promise<void> {
    const consumerHandler = rabbit.state.handlers.get(queue);
    if (!consumerHandler) throw new Error(`the daemon never subscribed to ${queue}`);
    await consumerHandler(message);
  }

  /** Deliver and swallow the rejection, returning whether it rejected. */
  async function deliverSafely(queue: string, message: ConsumeMessage): Promise<boolean> {
    try {
      await deliver(queue, message);
      return false;
    } catch {
      return true;
    }
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
      await deliver(OTHER_QUEUE, makeMessage('Something_Else', { value: 1 }));

      expect(handlers.Governance_VoteCast).toHaveBeenCalledTimes(1);
      expect(handlers.Governance_VoteCast).toHaveBeenCalledWith({ proposalId: '7' });
      expect(handlers.Something_Else).toHaveBeenCalledWith({ value: 1 });
    });

    test('a queue that fails to subscribe rejects initialize after the earlier queues were subscribed', async () => {
      rabbit.state.failConsumeFor = OTHER_QUEUE;

      await expect(daemon.initialize()).rejects.toThrow("NOT_FOUND - no queue 'blockchain.events.other' in vhost '/'");

      expect(rabbit.state.consumedOptions.map((entry) => entry.queue)).toEqual([QUEUE, OTHER_QUEUE]);
      expect(rabbit.state.consumerTags).toHaveLength(1);
      expect(logLines.some((line) => line.includes(`subscribed to ${QUEUE}`))).toBe(true);
    });

    test('a second initialize creates a second consumer for the same queue (documented behaviour)', async () => {
      await daemon.initialize();
      await daemon.initialize();

      expect(rabbit.state.consumedOptions.filter((entry) => entry.queue === QUEUE)).toHaveLength(2);
      // The newer tag replaces the older one in the map, so stop() cancels only the newest consumer.
      expect(rabbit.state.consumerTags).toHaveLength(4);
    });
  });

  describe('delivery outcome: acked', () => {
    test('a processed message is acked once and nothing else happens', async () => {
      await daemon.initialize();

      await deliver(QUEUE, makeMessage('Governance_VoteCast', { proposalId: '7' }));

      expect(rabbit.state.acked).toHaveLength(1);
      expect(rabbit.state.nacked).toHaveLength(0);
      expect(rabbit.state.cancelled).toEqual([]);
      expect(service.state.handles).toHaveLength(1);
      expect(service.state.handles[0].queueName).toBe(QUEUE);
    });

    test('the service outcome is what decides: "acked" means no probe is armed', async () => {
      await daemon.initialize();
      service.state.nextOutcome = 'acked';

      await deliver(QUEUE, makeMessage('Governance_VoteCast', {}));
      await sleep(PROBE_MS * 2);

      expect(rabbit.state.consumedOptions).toHaveLength(2); // only the initial subscriptions
      expect(rabbit.state.cancelled).toEqual([]);
    });

    test('a failing ack propagates out of the delivery (the broker will redeliver)', async () => {
      await daemon.initialize();
      rabbit.state.failAck = new Error('IllegalOperationError: Channel closed');

      await expect(deliver(QUEUE, makeMessage('Governance_VoteCast', {}))).rejects.toThrow('Channel closed');

      expect(rabbit.state.nacked).toHaveLength(0);
    });

    test('an unexpected rejection from the service leaves the message unacked', async () => {
      await daemon.initialize();
      service.handle.mockImplementationOnce(async () => {
        throw new Error('service exploded');
      });

      await expect(deliver(QUEUE, makeMessage('Governance_VoteCast', {}))).rejects.toThrow('service exploded');

      expect(rabbit.state.acked).toHaveLength(0);
      expect(rabbit.state.nacked).toHaveLength(0);
    });
  });

  describe('halt: probe, unsubscribe, requeue', () => {
    test('a halted delivery cancels the consumer and requeues the message', async () => {
      await daemon.initialize();
      service.state.nextOutcome = 'halted';
      const tag = rabbit.state.consumerTags[0];

      await deliver(QUEUE, makeMessage('Governance_VoteCast', {}));

      expect(rabbit.state.cancelled).toEqual([tag]);
      expect(rabbit.state.nacked).toHaveLength(1);
      expect(rabbit.state.nacked[0].requeue).toBe(true);
      expect(rabbit.state.acked).toHaveLength(0);
    });

    test('the consumer is cancelled before the message is requeued', async () => {
      await daemon.initialize();
      service.state.nextOutcome = 'halted';
      const order: string[] = [];
      rabbit.cancelConsumer.mockImplementationOnce(async (tag: string) => {
        order.push(`cancel:${tag}`);
      });
      rabbit.nack.mockImplementationOnce(async () => {
        order.push('nack');
      });

      await deliver(QUEUE, makeMessage('Governance_VoteCast', {}));

      expect(order[0].startsWith('cancel:')).toBe(true);
      expect(order[1]).toBe('nack');
    });

    test('a failing cancel does not stop the requeue (two independent steps)', async () => {
      await daemon.initialize();
      service.state.nextOutcome = 'halted';
      rabbit.state.failCancel = new Error('IllegalOperationError: Channel closed');

      await deliver(QUEUE, makeMessage('Governance_VoteCast', {}));

      expect(rabbit.state.nacked).toHaveLength(1);
      expect(logLines.some((line) => line.includes('failed to unsubscribe'))).toBe(true);

      // The health-checked path must not be left with a throwing stub for the teardown.
      rabbit.state.failCancel = null;
    });

    test('a failing nack is logged and does not break the daemon', async () => {
      await daemon.initialize();
      service.state.nextOutcome = 'halted';
      rabbit.state.failNack = new Error('IllegalOperationError: Channel closed');

      await deliverSafely(QUEUE, makeMessage('Governance_VoteCast', {}));

      expect(logLines.some((line) => line.includes('failed to nack the halted message'))).toBe(true);
    });

    test('the probe resubscribes after the interval and marks the queue probed', async () => {
      await daemon.initialize();
      service.state.nextOutcome = 'halted';
      await deliver(QUEUE, makeMessage('Governance_VoteCast', {}));
      expect(rabbit.state.consumedOptions).toHaveLength(2);

      await waitFor(() => rabbit.state.consumedOptions.length === 3);
      await waitFor(() => service.state.probed.includes(QUEUE));

      expect(rabbit.state.consumedOptions[2]).toEqual({ queue: QUEUE, options: { prefetch: 1 } });
      expect(service.markProbed).toHaveBeenCalledWith(QUEUE);
    });

    test('the probe does nothing while the queue is running again (probed elsewhere)', async () => {
      await daemon.initialize();
      service.state.nextOutcome = 'halted';
      await deliver(QUEUE, makeMessage('Governance_VoteCast', {}));

      // e.g. a redelivered message succeeded in the meantime
      service.state.statuses.set(QUEUE, 'running');
      await sleep(PROBE_MS * 3);

      expect(rabbit.state.consumedOptions).toHaveLength(2);
      expect(service.state.probed).toEqual([]);
    });

    test('a failed probe resubscription is retried on the next interval', async () => {
      await daemon.initialize();
      service.state.nextOutcome = 'halted';
      await deliver(QUEUE, makeMessage('Governance_VoteCast', {}));

      rabbit.state.failConsumeFor = QUEUE;
      await sleep(PROBE_MS * 2);
      expect(logLines.some((line) => line.includes('probe failed to resubscribe'))).toBe(true);

      rabbit.state.failConsumeFor = null;
      await waitFor(() => service.state.probed.includes(QUEUE));

      expect(rabbit.state.consumedOptions.filter((entry) => entry.queue === QUEUE).length).toBeGreaterThanOrEqual(3);
    });

    test('a halted queue that gets its message redelivered runs the cycle again and acks on success', async () => {
      await daemon.initialize();
      service.state.nextOutcome = 'halted';
      await deliver(QUEUE, makeMessage('Governance_VoteCast', {}));

      service.state.nextOutcome = 'acked';
      await deliver(QUEUE, makeMessage('Governance_VoteCast', {}, { redelivered: true }));

      expect(rabbit.state.acked).toHaveLength(1);
      expect(service.state.handles).toHaveLength(2);
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
      service.state.nextOutcome = 'halted';

      await deliver(QUEUE, makeMessage('Governance_VoteCast', {}, { raw: 'not-json{' }));

      expect(handlers.Governance_VoteCast).not.toHaveBeenCalled();
      const logged = logLines.find((line) => line.includes('payload is not valid JSON'))!;
      expect(logged).toContain('routingKey "Governance_VoteCast"');
      expect(logged).toContain('messageId "31337:0xabc:3"');
      expect(logged).toContain('body: not-json{');
      // The service still decides the outcome: halted here, so the message is requeued.
      expect(rabbit.state.nacked).toHaveLength(1);
    });

    test('an empty body is not valid JSON either and does not crash the pipeline', async () => {
      await daemon.initialize();
      service.state.nextOutcome = 'halted';

      await deliver(QUEUE, makeMessage('Governance_VoteCast', {}, { raw: '' }));

      expect(logLines.some((line) => line.includes('payload is not valid JSON'))).toBe(true);
      expect(rabbit.state.acked).toHaveLength(0);
    });

    test('a handler failure is left to the service (the daemon only requeues on halt)', async () => {
      await daemon.initialize();
      handlers.Governance_VoteCast.mockImplementationOnce(async () => {
        throw new Error('proposal update failed');
      });
      service.state.nextOutcome = 'halted';

      await deliver(QUEUE, makeMessage('Governance_VoteCast', {}));

      expect(service.state.handlerError).toBeInstanceOf(Error);
      expect(rabbit.state.nacked).toHaveLength(1);
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
    test('messages of the same queue are processed strictly one after another', async () => {
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
      expect(order).toEqual(['start:1']); // the second delivery has not started yet

      releaseFirst();
      await Promise.all([first, second]);

      expect(order).toEqual(['start:1', 'end:1', 'start:2', 'end:2']);
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
    test('with a live connection every consumer is cancelled and the probes are disarmed', async () => {
      await daemon.initialize();
      service.state.nextOutcome = 'halted';
      await deliver(QUEUE, makeMessage('Governance_VoteCast', {}));
      const heatedConsumers = rabbit.state.consumedOptions.length;

      await daemon.stop();
      await sleep(PROBE_MS * 3);

      expect(rabbit.state.cancelled).toHaveLength(2);
      expect(logLines.some((line) => line.includes(`Inbox consumer "${QUEUE}" stopped`))).toBe(true);
      // The armed probe never fired: no extra subscription after the stop.
      expect(rabbit.state.consumedOptions).toHaveLength(heatedConsumers);
    });

    test('without a connection nothing is cancelled (the broker already dropped the consumers)', async () => {
      await daemon.initialize();
      rabbit.state.connected = false;

      await daemon.stop();

      expect(rabbit.state.cancelled).toEqual([]);
      expect(logLines.some((line) => line.includes('Inbox consumer') && line.includes('stopped'))).toBe(false);
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

    test('a probe armed after the stop does not resubscribe when stop already disarmed it', async () => {
      await daemon.initialize();
      await daemon.stop();

      await sleep(PROBE_MS * 3);

      expect(rabbit.state.consumedOptions).toHaveLength(2);
      expect(service.state.probed).toEqual([]);
    });
  });
});
