/**
 * Integration tests for the inbox and the outbox over the real stack:
 * RabbitMQ and the MongoDB replica set `rs0` from
 * infrastructure/docker/docker-compose.yml (both ports are published on
 * 127.0.0.1 only, so this runs from the host).
 *
 * Written to be run with:
 *
 *   bun --env-file=infrastructure/docker/.env test --timeout=120000 \
 *     tests/rabbitmq/inboxOutbox.integration.test.ts
 *
 * Isolation: a dedicated database `rwa_rabbit_it` (dropped in afterAll) and
 * throw-away queue/exchange names with a per-run suffix. Nothing of the running
 * services is consumed or deleted.
 *
 * What is pinned down here (the parts the unit tests can only fake):
 *   - the outbox row is written before the broker is involved, survives a
 *     failing publish, and a duplicate messageId is stored once;
 *   - the inbox marker and the handler share one Mongo transaction, so a failed
 *     attempt leaves no marker and the retry can apply the effect;
 *   - an exhausted delivery is dead-lettered, and after the retry cycles the
 *     message is parked and acked;
 *   - a message without messageId can never be deduplicated and never gets a
 *     marker.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { connect } from 'amqplib';
import type { ChannelModel, ConfirmChannel } from 'amqplib';
import mongoose from 'mongoose';
import { BaseRabbitMQClient } from '@shared/rabbitmq/src/baseRabbitmq.client';
import { InboxConsumerService } from '@shared/inbox-consumer/src/services/inboxConsumer.service';
import { InboxConsumerMessageRepository } from '@shared/inbox-consumer/src/repositories/inboxConsumerMessage.repository';
import { InboxConsumerMessageEntity } from '@shared/inbox-consumer/src/models/entity/inboxConsumerMessage.entity';
import { BaseInboxConsumerDaemon } from '@shared/inbox-consumer/src/daemons/baseInboxConsumer.daemon';
import { OutboxPublisherService } from '@shared/outbox-publisher/src/services/outboxPublisher.service';
import { OutboxPublisherMessageRepository } from '@shared/outbox-publisher/src/repositories/outboxPublisherMessage.repository';
import { OutboxPublisherMessageEntity } from '@shared/outbox-publisher/src/models/entity/outboxPublisherMessage.entity';

const user = process.env.RABBITMQ_DEFAULT_USER;
const password = process.env.RABBITMQ_PASSWORD;
const host = process.env.RABBITMQ_HOST ?? '127.0.0.1';
const port = process.env.RABBITMQ_PORT ?? '5672';
const mongoHost = process.env.MONGODB_HOST ?? '127.0.0.1';

if (!user || !password) {
  throw new Error(
    'RABBITMQ_DEFAULT_USER / RABBITMQ_PASSWORD are not set — run: ' +
      'bun --env-file=infrastructure/docker/.env test tests/rabbitmq/inboxOutbox.integration.test.ts',
  );
}

const RABBIT_URI = `amqp://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}`;
const MONGO_URI = `mongodb://${mongoHost}:27017/rwa_rabbit_it?directConnection=true`;

const RUN = `${process.pid}-${Date.now()}`;
const EXCHANGE = `it.io.exchange.${RUN}`;
const QUEUE = `it.io.queue.${RUN}`;
const RETRY_QUEUE = `${QUEUE}.retry`;
const PARKED_QUEUE = `${QUEUE}.parked`;


async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error(`waitFor: the condition was not met within ${timeoutMs}ms`);
    await Bun.sleep(50);
  }
}

/**
 * Same shape as a real service: finite retry policy, so the broker materialises
 * `<queue>.retry` and `<queue>.parked` next to the main queue.
 */
class TestClient extends BaseRabbitMQClient {
  constructor() {
    super(RABBIT_URI, 'it-inbox-outbox', 200);
  }

  getTopologyDefinition(): ReturnType<BaseRabbitMQClient['getTopologyDefinition']> {
    return {
      exchanges: { [EXCHANGE]: { type: 'direct' as const, options: { durable: true }, allowUnrouted: false } },
      queues: {
        [QUEUE]: {
          options: { durable: true },
          deferAfterAttempts: 2,
          parkAfterCycles: 2,
          bindings: { [EXCHANGE]: ['task'] as const },
        },
      },
    } as const;
  }
}

type Handler = (payload: any, commitInbox: () => Promise<void>) => Promise<void>;

class TestInboxDaemon extends BaseInboxConsumerDaemon {
  constructor(client: TestClient, consumerService: InboxConsumerService, handler: Handler) {
    super(client, consumerService, {
      [QUEUE]: { prefetch: 1, isSync: true, handlers: { task: handler } },
    } as never);
  }
}

describe('inbox + outbox over the real stack', () => {
  let client: TestClient;
  let raw: { connection: ChannelModel; channel: ConfirmChannel };
  let outbox: OutboxPublisherService;
  let inbox: InboxConsumerService;
  let daemon: TestInboxDaemon | null = null;

  beforeAll(async () => {
    await mongoose.connect(MONGO_URI);
    await InboxConsumerMessageEntity.init();
    await OutboxPublisherMessageEntity.init();
    await InboxConsumerMessageEntity.deleteMany({});
    await OutboxPublisherMessageEntity.deleteMany({});
    await InboxConsumerMessageEntity.syncIndexes();
    await OutboxPublisherMessageEntity.syncIndexes();

    client = new TestClient();
    await client.initialize();

    const connection = await connect(RABBIT_URI, { heartbeat: 5 });
    connection.on('error', () => undefined);
    const channel = await connection.createConfirmChannel();
    channel.on('error', () => undefined);
    raw = { connection, channel };

    outbox = new OutboxPublisherService(client, new OutboxPublisherMessageRepository());
    inbox = new InboxConsumerService(new InboxConsumerMessageRepository());
  });

  beforeEach(async () => {
    // nothing of the previous test may be redelivered into this one
    await raw.channel.purgeQueue(QUEUE);
    await raw.channel.purgeQueue(RETRY_QUEUE);
    await raw.channel.purgeQueue(PARKED_QUEUE);
  });

  afterEach(async () => {
    await daemon?.stop();
    daemon = null;
  });

  afterAll(async () => {
    await client.disconnect();

    try {
      await raw.channel.deleteQueue(QUEUE);
      await raw.channel.deleteQueue(RETRY_QUEUE);
      await raw.channel.deleteQueue(PARKED_QUEUE);
      await raw.channel.deleteExchange(EXCHANGE);
    } catch {
      // already gone
    }

    await raw.connection.close().catch(() => undefined);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  async function startDaemon(handler: Handler): Promise<void> {
    daemon = new TestInboxDaemon(client, inbox, handler);
    await daemon.initialize();
  }

  test('the outbox stores a message before the broker sees it and stores a duplicate messageId once', async () => {
    await outbox.publish(EXCHANGE, 'task', { n: 1 }, 'io-dup-1');
    await outbox.publish(EXCHANGE, 'task', { n: 1 }, 'io-dup-1');

    const rows = await OutboxPublisherMessageEntity.find({ exchange: EXCHANGE }).lean();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ routingKey: 'task', messageId: 'io-dup-1', status: 'pending', attempts: 0 });
    expect(rows[0].payload).toEqual({ n: 1 });
  });

  test('a pending outbox row is published, confirmed and marked sent; the consumer sees it once', async () => {
    const received: string[] = [];
    const tag = await client.consume(QUEUE, async (message) => {
      if (!message) return;
      received.push(message.properties.messageId ?? '');
      await client.ack(message);
    }, { prefetch: 1 });

    await outbox.publish(EXCHANGE, 'task', { n: 2 }, 'io-sent-1');
    await outbox.processOutbox(EXCHANGE, true, 1, Number.POSITIVE_INFINITY);

    await waitFor(() => received.includes('io-sent-1'), 10_000);

    const row = await OutboxPublisherMessageEntity.findOne({ exchange: EXCHANGE, messageId: 'io-sent-1' }).lean();
    expect(row?.status).toBe('sent');
    expect(row?.sentAt).toBeGreaterThan(0);
    expect(row?.ttlDate).toBeInstanceOf(Date);

    await client.cancelConsumer(tag);
  }, 30_000);

  test('an unroutable outbox message burns its attempts and ends up failed', async () => {
    await outbox.publish(EXCHANGE, 'nobody_binds_this', { n: 3 }, 'io-failed-1');

    await outbox.processOutbox(EXCHANGE, true, 1, 2);
    await outbox.processOutbox(EXCHANGE, true, 1, 2);

    const row = await OutboxPublisherMessageEntity.findOne({ exchange: EXCHANGE, messageId: 'io-failed-1' }).lean();

    expect(row?.status).toBe('failed');
    expect(row?.attempts).toBe(2);
  });

  test('the inbox marker and the effect share one transaction: a failed attempt leaves no marker', async () => {
    await startDaemon(async () => {
      throw new Error('handler exploded');
    });

    await client.publish(EXCHANGE, 'task', { n: 4 }, { messageId: 'io-inbox-rollback' });

    // two in-process attempts, both roll the marker back, then the delivery is deferred
    await waitFor(async () => (await raw.channel.checkQueue(RETRY_QUEUE)).messageCount === 1, 20_000);

    expect(await InboxConsumerMessageEntity.countDocuments({ messageId: 'io-inbox-rollback' })).toBe(0);
  }, 40_000);

  test('a retry inside the same delivery applies the effect exactly once', async () => {
    let calls = 0;
    await startDaemon(async (_payload, commitInbox) => {
      calls += 1;
      if (calls === 1) throw new Error('first attempt fails');
      await commitInbox();
    });

    await client.publish(EXCHANGE, 'task', { n: 5 }, { messageId: 'io-inbox-retry' });

    await waitFor(() => calls === 2, 20_000);
    await waitFor(
      async () => (await InboxConsumerMessageEntity.countDocuments({ messageId: 'io-inbox-retry' })) === 1,
      20_000,
    );

    expect(await InboxConsumerMessageEntity.countDocuments({ messageId: 'io-inbox-retry' })).toBe(1);
    expect((await raw.channel.checkQueue(QUEUE)).messageCount).toBe(0);
  }, 30_000);

  test('a duplicate delivery is acked without running the handler again', async () => {
    let calls = 0;
    await startDaemon(async (_payload, commitInbox) => {
      calls += 1;
      await commitInbox();
    });

    await client.publish(EXCHANGE, 'task', { n: 6 }, { messageId: 'io-inbox-dup' });
    await waitFor(() => calls === 1, 20_000);

    await client.publish(EXCHANGE, 'task', { n: 6 }, { messageId: 'io-inbox-dup' });
    await waitFor(async () => (await raw.channel.checkQueue(QUEUE)).messageCount === 0, 20_000);
    await Bun.sleep(200);

    expect(calls).toBe(1);
    expect(await InboxConsumerMessageEntity.countDocuments({ messageId: 'io-inbox-dup' })).toBe(1);

    // a message behind the duplicate proves the duplicate was acked: with prefetch 1
    // an unacked duplicate blocks the whole queue
    await client.publish(EXCHANGE, 'task', { n: 7 }, { messageId: 'io-inbox-after-dup' });
    await waitFor(() => calls === 2, 20_000);
    expect(await InboxConsumerMessageEntity.countDocuments({ messageId: 'io-inbox-after-dup' })).toBe(1);
  }, 30_000);

  test('after the retry cycles the message is parked, acked and never marked', async () => {
    await startDaemon(async () => {
      throw new Error('always fails');
    });

    // the broker adds x-death itself; publish the count a real second cycle would carry
    await client.publish(
      EXCHANGE,
      'task',
      { n: 7 },
      {
        messageId: 'io-inbox-parked',
        headers: { 'x-death': [{ queue: RETRY_QUEUE, reason: 'expired', count: 2 }] },
      },
    );

    await waitFor(async () => (await raw.channel.checkQueue(PARKED_QUEUE)).messageCount === 1, 30_000);

    expect(await InboxConsumerMessageEntity.countDocuments({ messageId: 'io-inbox-parked' })).toBe(0);
    expect((await raw.channel.checkQueue(QUEUE)).messageCount).toBe(0);
  }, 60_000);

  test('a message without messageId can never be applied: no marker, delivery deferred', async () => {
    let calls = 0;
    await startDaemon(async () => {
      calls += 1;
    });

    const before = await InboxConsumerMessageEntity.countDocuments({});

    await client.publish(EXCHANGE, 'task', { n: 8 });

    await waitFor(async () => (await raw.channel.checkQueue(RETRY_QUEUE)).messageCount === 1, 20_000);

    expect(calls).toBe(0);
    expect(await InboxConsumerMessageEntity.countDocuments({})).toBe(before);
  }, 40_000);

  test('the inbox rejects a non-JSON body and the delivery ends up deferred (never applied)', async () => {
    let calls = 0;
    await startDaemon(async () => {
      calls += 1;
    });

    raw.channel.publish(EXCHANGE, 'task', Buffer.from('not-json{'), { messageId: 'io-inbox-raw' });
    await raw.channel.waitForConfirms();

    await waitFor(async () => (await raw.channel.checkQueue(RETRY_QUEUE)).messageCount === 1, 20_000);

    expect(calls).toBe(0);
    expect(await InboxConsumerMessageEntity.countDocuments({ messageId: 'io-inbox-raw' })).toBe(0);
  }, 40_000);

  test('a broker outage does not lose an outbox message (destructive)', async () => {
    const compose = ['docker', 'compose', '-f', 'infrastructure/docker/docker-compose.yml'];

    await outbox.publish(EXCHANGE, 'task', { n: 9 }, 'io-outage-1');

    Bun.spawnSync([...compose, 'stop', 'rabbitmq']);
    await Bun.sleep(3_000);

    // the publish fails, the row stays sending and is retried on the next pass
    await outbox.processOutbox(EXCHANGE, true, 1, Number.POSITIVE_INFINITY);

    const during = await OutboxPublisherMessageEntity.findOne({ messageId: 'io-outage-1' }).lean();
    expect(during?.status).toBe('sending');
    expect(during?.attempts).toBe(1);

    Bun.spawnSync([...compose, 'start', 'rabbitmq']);
    await waitFor(() => client.isConnected(), 90_000);

    const received: string[] = [];
    const tag = await client.consume(QUEUE, async (message) => {
      if (!message) return;
      received.push(message.properties.messageId ?? '');
      await client.ack(message);
    }, { prefetch: 1 });

    await waitFor(async () => {
      try {
        await outbox.processOutbox(EXCHANGE, true, 1, Number.POSITIVE_INFINITY);
        return received.includes('io-outage-1');
      } catch {
        return false;
      }
    }, 60_000);

    const after = await OutboxPublisherMessageEntity.findOne({ messageId: 'io-outage-1' }).lean();
    expect(after?.status).toBe('sent');

    await client.cancelConsumer(tag);
  }, 180_000);
});
