import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { connect } from 'amqplib';
import mongoose from 'mongoose';
import { createOrderedPublisherPlugin as createPublisherPlugin } from '@shared/ordered-publisher/src/plugin';
import { createOrderedConsumerPlugin as createConsumerPlugin } from '@shared/ordered-consumer/src/plugin';
import { OutboxMessageEntity } from '@shared/ordered-publisher/src/models/entity/outboxMessage.entity';
import { ProcessedMessageEntity } from '@shared/ordered-consumer/src/models/entity/processedMessage.entity';
import type { OrderedPublisherService } from '@shared/ordered-publisher/src/services/orderedPublisher.service';
import type { OrderedConsumerService } from '@shared/ordered-consumer/src/services/orderedConsumer.service';

/**
 * End-to-end test of ordered delivery: the real publisher plugin and the real
 * consumer plugin over the real stack — MongoDB replica set `rs0` and RabbitMQ
 * from `infrastructure/docker/docker-compose.yml` (their ports are published on
 * 127.0.0.1 only, so this test runs from the host).
 *
 * The stack must be up (`bun run app:up`). Run:
 *   bun --env-file=infrastructure/docker/.env test --timeout=200000 tests/orderedDeliveryE2e.test.ts
 */

const rabbitUser = process.env.RABBITMQ_DEFAULT_USER;
const rabbitPassword = process.env.RABBITMQ_PASSWORD;

if (!rabbitUser || !rabbitPassword) {
  throw new Error(
    'RABBITMQ_DEFAULT_USER / RABBITMQ_PASSWORD are not set — run: ' +
      'bun --env-file=infrastructure/docker/.env test tests/orderedDeliveryE2e.test.ts',
  );
}

const RABBITMQ_URI = `amqp://${encodeURIComponent(rabbitUser)}:${encodeURIComponent(rabbitPassword)}@127.0.0.1:5672`;
const MONGODB_URI = 'mongodb://127.0.0.1:27017/ordered_delivery_e2e?directConnection=true';
const EXCHANGE = 'ordered.delivery.e2e';
const QUEUE = 'ordered.delivery.e2e.consumer';
const ROUTING_KEY = 'e2e.events';

async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (!(await condition())) {
    if (Date.now() > deadline) {
      throw new Error(`waitFor: the condition was not met within ${timeoutMs}ms`);
    }

    await Bun.sleep(50);
  }
}

describe('ordered delivery E2E (publisher + consumer over the real stack)', () => {
  const handled: number[] = [];
  const handlerCalls = new Map<string, number>();
  let failingMessageId: string | null = null;

  let publisherApp: Awaited<ReturnType<typeof createPublisherPlugin>>;
  let consumerApp: Awaited<ReturnType<typeof createConsumerPlugin>>;
  let publisher: OrderedPublisherService;
  let consumer: OrderedConsumerService;

  beforeAll(async () => {
    await mongoose.connect(MONGODB_URI);

    // clean slate: both collections and the e2e queue
    await OutboxMessageEntity.init();
    await ProcessedMessageEntity.init();
    await OutboxMessageEntity.deleteMany({});
    await ProcessedMessageEntity.deleteMany({});

    const cleanupConnection = await connect(RABBITMQ_URI);
    cleanupConnection.on('error', () => undefined);

    const cleanupChannel = await cleanupConnection.createChannel();
    cleanupChannel.on('error', () => undefined);

    try {
      await cleanupChannel.deleteQueue(QUEUE);
    } catch {
      // the queue does not exist yet — nothing to delete
    }

    await cleanupConnection.close();

    publisherApp = await createPublisherPlugin(RABBITMQ_URI, EXCHANGE, 200);
    consumerApp = await createConsumerPlugin(RABBITMQ_URI, EXCHANGE, QUEUE);

    publisher = publisherApp.decorator.orderedPublisher as OrderedPublisherService;
    consumer = consumerApp.decorator.orderedConsumer as OrderedConsumerService;
  });

  afterAll(async () => {
    if (!consumerApp) return;

    // stop() runs the plugins' onStop hooks (daemon stop + rabbit disconnect);
    // Elysia requires a started server before it can stop
    consumerApp.listen(0);
    await consumerApp.stop();

    publisherApp.listen(0);
    await publisherApp.stop();

    await mongoose.disconnect();
  });

  it('delivers the whole batch exactly once and strictly in order', async () => {
    const total = 60;

    for (let seq = 1; seq <= total; seq += 1) {
      await publisher.publish(ROUTING_KEY, { seq }, `e2e-${seq}`);
    }

    await waitFor(() => handled.length === total, 30_000);

    expect(handled).toEqual(Array.from({ length: total }, (_, index) => index + 1));
    await waitFor(async () => (await OutboxMessageEntity.countDocuments({ status: 'sent' })) === total, 10_000);
    await waitFor(async () => (await ProcessedMessageEntity.countDocuments()) === total, 10_000);
  }, 60_000);

  it('skips a re-published messageId via the inbox and keeps the stream running', async () => {
    await publisher.publish(ROUTING_KEY, { seq: 100 }, 'e2e-duplicate');
    await publisher.publish(ROUTING_KEY, { seq: 100 }, 'e2e-duplicate');
    await publisher.publish(ROUTING_KEY, { seq: 101 }, 'e2e-after-duplicate');

    // 101 arrives after both copies of the duplicate message (FIFO, prefetch 1),
    // so by the time it is handled the duplicate has been fully processed too
    await waitFor(() => handled.includes(101), 20_000);

    expect(handled.filter((seq) => seq === 100)).toEqual([100]);
    expect(handlerCalls.get('e2e-duplicate')).toBe(1);
    expect(await ProcessedMessageEntity.countDocuments({ key: 'e2e-duplicate' })).toBe(1);
    expect(consumer.status().state).toBe('running');
  }, 60_000);

  it('halts after three failed attempts, freezes the stream, then the probe resumes it in order', async () => {
    failingMessageId = 'e2e-failing';
    await publisher.publish(ROUTING_KEY, { seq: 200 }, 'e2e-failing');
    await publisher.publish(ROUTING_KEY, { seq: 201 }, 'e2e-failing-next');

    await waitFor(() => consumer.status().state === 'halted', 30_000);

    expect(handlerCalls.get('e2e-failing')).toBe(3);
    expect(handled).not.toContain(200);

    // nothing behind the failed message moves while the stream is halted
    await publisher.publish(ROUTING_KEY, { seq: 202 }, 'e2e-while-halted');
    const frozen = handled.length;
    await Bun.sleep(3_000);

    expect(handled.length).toBe(frozen);

    // fix the cause: the 60s probe resubscribes and the stream drains in order
    failingMessageId = null;
    await waitFor(() => handled.includes(202), 120_000);

    expect(handled.slice(-3)).toEqual([200, 201, 202]);
    expect(handlerCalls.get('e2e-failing')).toBe(4);
    expect(await ProcessedMessageEntity.countDocuments({ key: 'e2e-failing' })).toBe(1);
    expect(consumer.status().state).toBe('running');
  }, 180_000);
});
