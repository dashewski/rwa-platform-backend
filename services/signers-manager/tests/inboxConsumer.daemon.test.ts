/**
 * Unit tests for the signers-manager InboxConsumerDaemon.
 *
 * The daemon subscribes to `sign.responses`, decodes the `response` payload and
 * hands it to SignaturesService.addSignature; ack / retry is decided by
 * BaseInboxConsumerDaemon based on the outcome of the delivery.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { ConsumeMessage } from 'amqplib';
import { InboxConsumerDaemon } from '../src/daemons/inboxConsumer.daemon';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import {
  asConsumerService,
  asRabbitClient,
  asSignaturesService,
  createFakeConsumerService,
  createFakeRabbitClient,
  createFakeSignaturesService,
  makeMessage,
  RESPONSES_QUEUE,
  type FakeConsumerService,
  type FakeRabbitClient,
  type FakeSignaturesService,
} from './fakes/inbox.fake';

const RESPONSE = {
  taskId: 'task-1',
  signer: '0x1111111111111111111111111111111111111111',
  hash: '0xabc',
  signature: '0xsig',
};

let logLines: string[] = [];
const original = { info: logger.info, warn: logger.warn, error: logger.error };

function captureLogs(): void {
  logLines = [];
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
  logger.info = original.info;
  logger.warn = original.warn;
  logger.error = original.error;
}

describe('signers-manager InboxConsumerDaemon (unit, fake client + fake services)', () => {
  let rabbit: FakeRabbitClient;
  let consumer: FakeConsumerService;
  let signatures: FakeSignaturesService;
  let daemon: InboxConsumerDaemon;

  beforeEach(() => {
    rabbit = createFakeRabbitClient();
    consumer = createFakeConsumerService();
    signatures = createFakeSignaturesService();
    daemon = new InboxConsumerDaemon(
      asRabbitClient(rabbit) as never,
      asConsumerService(consumer),
      asSignaturesService(signatures),
    );
    captureLogs();
  });

  afterEach(async () => {
    await daemon.stop();
    restoreLogs();
  });

  async function waitForSettled(settledBefore: number): Promise<void> {
    for (let attempt = 0; attempt < 1_000; attempt += 1) {
      if (rabbit.state.acked.length + rabbit.state.nacked.length > settledBefore) return;
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    throw new Error('the delivery did not settle (no ack / nack)');
  }

  async function deliver(message: ConsumeMessage): Promise<void> {
    const handler = rabbit.state.handlers.get(RESPONSES_QUEUE);
    if (!handler) throw new Error('the daemon never subscribed to the responses queue');
    const settled = rabbit.state.acked.length + rabbit.state.nacked.length;

    // The queue is parallel (isSync=false): the consumer handler returns before
    // the delivery is acked, so the outcome has to be awaited separately.
    await handler(message);
    await waitForSettled(settled);
  }

  test('subscribes to sign.responses with prefetch 5', async () => {
    await daemon.initialize();

    expect(rabbit.state.consumedOptions).toEqual([{ queue: RESPONSES_QUEUE, options: { prefetch: 5 } }]);
    expect(logLines.some((line) => line.includes(`subscribed to ${RESPONSES_QUEUE}`))).toBe(true);
  });

  test('a response message is decoded and applied through the service', async () => {
    await daemon.initialize();

    await deliver(makeMessage('response', RESPONSE));

    expect(signatures.state.responses).toEqual([RESPONSE]);
    expect(rabbit.state.acked).toHaveLength(1);
  });

  test('the queue deferAfterAttempts is passed to the consumer service', async () => {
    rabbit.state.deferAfterAttempts = 3;
    await daemon.initialize();

    await deliver(makeMessage('response', RESPONSE));

    expect(consumer.state.handles[0].maxAttempts).toBe(3);
  });

  test('a deferred delivery is handed to the retry queue (requeue=false)', async () => {
    await daemon.initialize();
    consumer.state.nextOutcome = 'deferred';

    await deliver(makeMessage('response', RESPONSE));

    expect(rabbit.state.nacked).toHaveLength(1);
    expect(rabbit.state.nacked[0].requeue).toBe(false);
    expect(rabbit.state.acked).toHaveLength(0);
  });

  test('after parkAfterCycles retry cycles the message is parked and acked', async () => {
    rabbit.state.parkAfterCycles = 1;
    await daemon.initialize();
    consumer.state.nextOutcome = 'deferred';

    await deliver(
      makeMessage('response', RESPONSE, {
        headers: {
          'x-death': [
            [
              ['queue', `${RESPONSES_QUEUE}.retry`],
              ['reason', 'expired'],
              ['count', 1],
            ],
          ],
        },
      }),
    );

    expect(rabbit.state.parked).toEqual([{ queue: `${RESPONSES_QUEUE}.parked`, payload: RESPONSE }]);
    expect(rabbit.state.acked).toHaveLength(1);
  });

  test('a service failure is left to the inbox (no ack)', async () => {
    await daemon.initialize();
    signatures.state.error = new Error('Task already completed');
    consumer.state.nextOutcome = 'deferred';

    await deliver(makeMessage('response', RESPONSE));

    expect(consumer.state.handlerError).toBeInstanceOf(Error);
    expect(rabbit.state.acked).toHaveLength(0);
    expect(rabbit.state.nacked).toHaveLength(1);
  });

  test('an unknown routing key is warned about and acked without touching the service', async () => {
    await daemon.initialize();

    await deliver(makeMessage('task', RESPONSE));

    expect(signatures.state.responses).toEqual([]);
    expect(logLines.some((line) => line.includes('no handler registered for task'))).toBe(true);
    expect(rabbit.state.acked).toHaveLength(1);
  });

  test('a body that is not valid JSON never reaches the service', async () => {
    await daemon.initialize();
    consumer.state.nextOutcome = 'deferred';

    await deliver(makeMessage('response', {}, { raw: 'not-json{' }));

    expect(signatures.state.responses).toEqual([]);
    expect(logLines.some((line) => line.includes('payload is not valid JSON'))).toBe(true);
  });
});
