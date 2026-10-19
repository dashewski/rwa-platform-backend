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

  async function deliver(message: ConsumeMessage): Promise<void> {
    const handler = rabbit.state.handlers.get(REQUESTS_QUEUE);
    if (!handler) throw new Error('the daemon never subscribed to the requests queue');
    await handler(message);
  }

  test('subscribes to its own requests queue with prefetch 1', async () => {
    await daemon.initialize();

    expect(rabbit.state.consumedOptions).toEqual([{ queue: REQUESTS_QUEUE, options: { prefetch: 1 } }]);
    expect(logLines.some((line) => line.includes(`Inbox consumer subscribed to ${REQUESTS_QUEUE}`))).toBe(true);
  });

  test('a task message is decoded and handed to the signature service', async () => {
    await daemon.initialize();
    const task = { hash: '0xabc', taskId: 'task-1', expired: 1_900_000_000 };

    await deliver(makeMessage('task', task));

    expect(signature.state.tasks).toEqual([task]);
    expect(rabbit.state.acked).toHaveLength(1);
  });

  test('the queue deferAfterAttempts is passed to the consumer service', async () => {
    rabbit.state.deferAfterAttempts = 3;
    await daemon.initialize();

    await deliver(makeMessage('task', { hash: '0xabc', taskId: 'task-1', expired: 1_900_000_000 }));

    expect(consumer.state.handles[0].maxAttempts).toBe(3);
  });

  test('a deferred delivery is handed to the retry queue (requeue=false)', async () => {
    await daemon.initialize();
    consumer.state.nextOutcome = 'deferred';

    await deliver(makeMessage('task', { hash: '0xabc', taskId: 'task-1', expired: 1_900_000_000 }));

    expect(rabbit.state.nacked).toHaveLength(1);
    expect(rabbit.state.nacked[0].requeue).toBe(false);
    expect(rabbit.state.acked).toHaveLength(0);
  });

  test('a signature failure is left to the inbox (no ack, outcome decides)', async () => {
    await daemon.initialize();
    signature.state.error = new Error('Task expired');
    consumer.state.nextOutcome = 'deferred';

    await deliver(makeMessage('task', { hash: '0xabc', taskId: 'task-1', expired: 1 }));

    expect(consumer.state.handlerError).toBeInstanceOf(Error);
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

  test('a message without messageId still reaches the service (the dedup guard is in the inbox)', async () => {
    await daemon.initialize();

    await deliver(makeMessage('task', { hash: '0xabc', taskId: 'task-1', expired: 1_900_000_000 }, { messageId: null }));

    expect(signature.state.tasks).toHaveLength(1);
  });

  test('a body that is not valid JSON never reaches the service', async () => {
    await daemon.initialize();
    consumer.state.nextOutcome = 'deferred';

    await deliver(makeMessage('task', {}, { raw: 'not-json{' }));

    expect(signature.state.tasks).toEqual([]);
    expect(logLines.some((line) => line.includes('payload is not valid JSON'))).toBe(true);
  });
});
