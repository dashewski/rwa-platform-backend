/**
 * Unit tests for the signer's InboxConsumerDaemon.
 *
 * The daemon is the only routing layer: it subscribes to its own
 * `sign.requests.<name>` queue, hands the decoded `task` payload to
 * SignatureService and lets BaseInboxConsumerDaemon decide ack / retry.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { ConsumeMessage } from 'amqplib';
import { InboxConsumerDaemon } from '../src/daemons/inboxConsumer.daemon';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import {
  asConsumerService,
  asRabbitClient,
  asSignatureService,
  createFakeConsumerService,
  createFakeRabbitClient,
  createFakeSignatureService,
  makeMessage,
  REQUESTS_QUEUE,
  type FakeConsumerService,
  type FakeRabbitClient,
  type FakeSignatureService,
} from './fakes';

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

describe('signer InboxConsumerDaemon (unit, fake client + fake services)', () => {
  let rabbit: FakeRabbitClient;
  let consumer: FakeConsumerService;
  let signature: FakeSignatureService;
  let daemon: InboxConsumerDaemon;

  beforeEach(() => {
    rabbit = createFakeRabbitClient();
    consumer = createFakeConsumerService();
    signature = createFakeSignatureService();
    daemon = new InboxConsumerDaemon(
      asRabbitClient(rabbit) as never,
      asConsumerService(consumer),
      asSignatureService(signature),
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
    const handler = rabbit.state.handlers.get(REQUESTS_QUEUE);
    if (!handler) throw new Error('the daemon never subscribed to the requests queue');
    const settled = rabbit.state.acked.length + rabbit.state.nacked.length;

    // The queue is parallel (isSync=false): the consumer handler returns before
    // the delivery is acked, so the outcome has to be awaited separately.
    await handler(message);
    await waitForSettled(settled);
  }

  test('subscribes to its own requests queue with prefetch 5', async () => {
    await daemon.initialize();

    expect(rabbit.state.consumedOptions).toEqual([{ queue: REQUESTS_QUEUE, options: { prefetch: 5 } }]);
    expect(logLines.some((line) => line.includes(`Inbox consumer subscribed to ${REQUESTS_QUEUE}`))).toBe(true);
  });

  test('a task message is decoded and handed to the signature service', async () => {
    await daemon.initialize();
    const task = { hash: '0xabc', taskId: 'task-1', expired: 1_900_000_000 };

    await deliver(makeMessage('task', task));

    expect(signature.state.tasks).toEqual([task]);
    expect(rabbit.state.acked).toHaveLength(1);
  });

  test('an exhausted delivery goes to the retry queue (requeue=false)', async () => {
    rabbit.state.deferAfterAttempts = 1;
    await daemon.initialize();
    signature.state.error = new Error('Task expired');

    await deliver(makeMessage('task', { hash: '0xabc', taskId: 'task-1', expired: 1 }));

    expect(consumer.state.commits).toEqual([]);
    expect(rabbit.state.nacked).toHaveLength(1);
    expect(rabbit.state.nacked[0].requeue).toBe(false);
    expect(rabbit.state.acked).toHaveLength(0);
  });

  test('a signature failure is not acked: the inbox retries the delivery', async () => {
    rabbit.state.deferAfterAttempts = 1;
    await daemon.initialize();
    signature.state.error = new Error('Task expired');

    await deliver(makeMessage('task', { hash: '0xabc', taskId: 'task-1', expired: 1 }));

    expect(rabbit.state.acked).toHaveLength(0);
    expect(rabbit.state.nacked).toHaveLength(1);
  });

  test('an unknown routing key is warned about and acked without touching the service', async () => {
    await daemon.initialize();

    await deliver(makeMessage('response', { taskId: 'task-1' }));

    expect(signature.state.tasks).toEqual([]);
    expect(logLines.some((line) => line.includes('no handler registered for response'))).toBe(true);
    expect(rabbit.state.acked).toHaveLength(1);
  });

  test('a message without messageId is refused: the inbox cannot deduplicate it', async () => {
    rabbit.state.deferAfterAttempts = 1;
    await daemon.initialize();

    await deliver(
      makeMessage('task', { hash: '0xabc', taskId: 'task-1', expired: 1_900_000_000 }, { messageId: null }),
    );

    expect(signature.state.tasks).toHaveLength(0);
    expect(rabbit.state.nacked).toHaveLength(1);
    expect(logLines.some((line) => line.includes('the message has no messageId'))).toBe(true);
  });

  test('a body that is not valid JSON never reaches the service', async () => {
    rabbit.state.deferAfterAttempts = 1;
    await daemon.initialize();

    await deliver(makeMessage('task', {}, { raw: 'not-json{' }));

    expect(signature.state.tasks).toEqual([]);
    expect(logLines.some((line) => line.includes('payload is not valid JSON'))).toBe(true);
  });
});
