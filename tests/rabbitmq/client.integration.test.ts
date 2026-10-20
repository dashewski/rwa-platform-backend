/**
 * Integration tests for BaseRabbitMQClient against the real broker from
 * infrastructure/docker/docker-compose.yml (RabbitMQ 4.3, port 5672 published
 * on 127.0.0.1 only, so this runs from the host).
 *
 * The stack does not have to be started for these files to be *written*, only
 * to be run:
 *
 *   bun --env-file=infrastructure/docker/.env test --timeout=120000 \
 *     tests/rabbitmq/client.integration.test.ts
 *
 * Everything here uses throw-away names (a per-run suffix) and deletes them in
 * afterAll — the queues of the running services are never touched.
 *
 * One test is destructive: it stops the broker, checks that the client reports
 * the outage, then starts it again and waits for the reconnect. The services of
 * the stand reconnect on their own.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { connect } from 'amqplib';
import type { ChannelModel, ConfirmChannel, ConsumeMessage } from 'amqplib';
import { BaseRabbitMQClient } from '@shared/rabbitmq/src/baseRabbitmq.client';

const user = process.env.RABBITMQ_DEFAULT_USER;
const password = process.env.RABBITMQ_PASSWORD;
const host = process.env.RABBITMQ_HOST ?? '127.0.0.1';
const port = process.env.RABBITMQ_PORT ?? '5672';

if (!user || !password) {
  throw new Error(
    'RABBITMQ_DEFAULT_USER / RABBITMQ_PASSWORD are not set — run: ' +
      'bun --env-file=infrastructure/docker/.env test tests/rabbitmq/client.integration.test.ts',
  );
}

const URI = `amqp://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}`;
const RUN = `${process.pid}-${Date.now()}`;
const EXCHANGE = `it.client.exchange.${RUN}`;
const QUEUE = `it.client.queue.${RUN}`;
const RETRY_QUEUE = `${QUEUE}.retry`;
const PARKED_QUEUE = `${QUEUE}.parked`;


async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error(`waitFor: the condition was not met within ${timeoutMs}ms`);
    await Bun.sleep(100);
  }
}

class TestClient extends BaseRabbitMQClient {
  constructor() {
    super(URI, 'it-client', 200);
  }

  getTopologyDefinition() {
    return {
      exchanges: { [EXCHANGE]: { type: 'direct' as const, options: { durable: true } } },
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

describe('BaseRabbitMQClient over the real broker', () => {
  let client: TestClient;
  /** Separate raw channel for assertions that must not disturb the client's. */
  let raw: { connection: ChannelModel; channel: ConfirmChannel };
  /** Consumers opened by the current test; cancelled after it ends. */
  let tags: string[] = [];

  async function consume(
    handler: (message: ConsumeMessage) => Promise<void>,
    prefetch = 1,
  ): Promise<void> {
    tags.push(await client.consume(QUEUE, async (message) => {
      if (message) await handler(message);
    }, { prefetch }));
  }

  beforeAll(async () => {
    client = new TestClient();
    await client.initialize();

    const connection = await connect(URI, { heartbeat: 5 });
    connection.on('error', () => undefined);

    const channel = await connection.createConfirmChannel();
    channel.on('error', () => undefined);

    raw = { connection, channel };
  });

  beforeEach(async () => {
    // leftovers of a previous test must not be delivered to the next consumer
    await raw.channel.purgeQueue(QUEUE);
    await raw.channel.purgeQueue(RETRY_QUEUE);
    await raw.channel.purgeQueue(PARKED_QUEUE);
  });

  afterEach(async () => {
    for (const tag of tags) await client.cancelConsumer(tag);
    tags = [];
  });

  afterAll(async () => {
    await client.disconnect();

    try {
      await raw.channel.deleteQueue(QUEUE);
      await raw.channel.deleteQueue(RETRY_QUEUE);
      await raw.channel.deleteQueue(PARKED_QUEUE);
      await raw.channel.deleteExchange(EXCHANGE);
    } catch {
      // the broker went away / the objects are already gone
    }

    await raw.connection.close().catch(() => undefined);
  });

  test('declares the main queue, the retry queue and the parked queue', async () => {
    const main = await raw.channel.checkQueue(QUEUE);
    const retry = await raw.channel.checkQueue(RETRY_QUEUE);
    const parked = await raw.channel.checkQueue(PARKED_QUEUE);

    expect(main.queue).toBe(QUEUE);
    expect(retry.queue).toBe(RETRY_QUEUE);
    expect(parked.queue).toBe(PARKED_QUEUE);
  });

  test('the retry wrapper is pinned: re-declaring with another TTL is rejected with 406', async () => {
    const connection = await connect(URI, { heartbeat: 5 });
    connection.on('error', () => undefined);
    const channel = await connection.createConfirmChannel();
    channel.on('error', () => undefined);

    // identical arguments -> idempotent
    await channel.assertQueue(QUEUE, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': RETRY_QUEUE },
    });

    // different arguments -> PRECONDITION_FAILED, the declaration in the client is the only allowed shape
    await expect(
      channel.assertQueue(RETRY_QUEUE, {
        durable: true,
        arguments: {
          'x-message-ttl': 1_000,
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': QUEUE,
        },
      }),
    ).rejects.toThrow(/PRECONDITION_FAILED/);

    await connection.close().catch(() => undefined);
  });

  test('publishes a confirmed message and the consumer receives it with the same messageId', async () => {
    const received: ConsumeMessage[] = [];

    await consume(async (message) => {
      received.push(message);
      await client.ack(message);
    });

    await client.publish(EXCHANGE, 'task', { taskId: 't-1', hash: '0xabc' }, { messageId: 'it-delivery-1' });

    await waitFor(() => received.length === 1, 10_000);

    expect(received[0].properties.messageId).toBe('it-delivery-1');
    expect(received[0].properties.contentType).toBe('application/json');
    expect(received[0].properties.deliveryMode).toBe(2);
    expect(JSON.parse(received[0].content.toString())).toEqual({ taskId: 't-1', hash: '0xabc' });
    expect((await raw.channel.checkQueue(QUEUE)).messageCount).toBe(0);
  });

  test('an unroutable message with a messageId rejects the publish (mandatory + basic.return)', async () => {
    await expect(
      client.publish(EXCHANGE, 'nobody_binds_this', { a: 1 }, { messageId: 'it-unroutable-1' }),
    ).rejects.toThrow(/no queue is bound to routing key "nobody_binds_this"/);
  });

  test('an unroutable message without a messageId resolves: the return cannot be correlated', async () => {
    await expect(client.publish(EXCHANGE, 'nobody_binds_this', { a: 1 })).resolves.toBeUndefined();
  });

  test('a nack(requeue=false) hands the message to the retry queue and it comes back after the TTL', async () => {
    let deliveries = 0;
    const delivered: ConsumeMessage[] = [];

    await consume(async (message) => {
      deliveries += 1;
      delivered.push(message);

      if (deliveries === 1) {
        await client.nack(message, false);
        return;
      }

      await client.ack(message);
    });

    await client.publish(EXCHANGE, 'task', { taskId: 't-retry' }, { messageId: 'it-retry-1' });

    // the first delivery is rejected and the message lands in the retry queue
    await waitFor(() => deliveries === 1, 10_000);
    await waitFor(async () => (await raw.channel.checkQueue(RETRY_QUEUE)).messageCount === 1, 10_000);

    // 30s TTL, then the dead letter returns it to the main queue
    await waitFor(() => deliveries === 2, 60_000);

    expect(delivered[1].properties.messageId).toBe('it-retry-1');

    // a dead-lettered message is re-published by the broker, so `redelivered` stays false;
    // the round trip is visible in x-death instead
    expect(delivered[1].fields.redelivered).toBe(false);

    const deaths = delivered[1].properties.headers?.['x-death'] as unknown as Array<Record<string, unknown>>;
    const expired = deaths.find((death) => death.queue === RETRY_QUEUE && death.reason === 'expired');
    expect(expired?.count).toBe(1);
  }, 90_000);

  test('park publishes straight into <queue>.parked', async () => {
    await client.park(PARKED_QUEUE, { taskId: 't-parked' }, { messageId: 'it-parked-1' });

    expect((await raw.channel.checkQueue(PARKED_QUEUE)).messageCount).toBe(1);
  });

  test('prefetch 1 keeps the second message in ready while the first is unacked', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let handled = 0;

    await consume(async (message) => {
      handled += 1;
      await gate;
      await client.ack(message);
    });

    await client.publish(EXCHANGE, 'task', { n: 1 }, { messageId: 'it-prefetch-1' });
    await client.publish(EXCHANGE, 'task', { n: 2 }, { messageId: 'it-prefetch-2' });

    await waitFor(() => handled === 1, 10_000);
    await Bun.sleep(300);

    // the first is unacked, the second is still in the queue
    expect(handled).toBe(1);
    expect((await raw.channel.checkQueue(QUEUE)).messageCount).toBe(1);

    release();
    await waitFor(async () => (await raw.channel.checkQueue(QUEUE)).messageCount === 0, 10_000);
  }, 30_000);

  test('a message body that is not JSON is delivered as-is (the broker does not validate it)', async () => {
    const bodies: string[] = [];

    await consume(async (message) => {
      bodies.push(message.content.toString());
      await client.ack(message);
    });

    raw.channel.publish(EXCHANGE, 'task', Buffer.from('not-json{'), { messageId: 'it-raw-1' });
    await raw.channel.waitForConfirms();

    await waitFor(() => bodies.length === 1, 10_000);

    expect(bodies[0]).toBe('not-json{');
  }, 30_000);

  test('a consumer killed mid-handler loses the ack: the broker redelivers the message', async () => {
    // a separate connection plays the process that dies
    const doomed = await connect(URI, { heartbeat: 5 });
    doomed.on('error', () => undefined);
    const doomedChannel = await doomed.createConfirmChannel();
    doomedChannel.on('error', () => undefined);

    let started = 0;
    let enteredResolve: () => void = () => undefined;
    const entered = new Promise<void>((resolve) => {
      enteredResolve = resolve;
    });

    await doomedChannel.prefetch(1);
    await doomedChannel.consume(
      QUEUE,
      async (message) => {
        if (!message) return;

        started += 1;
        enteredResolve();

        // the handler never finishes: the process is killed below, no ack is sent
        await new Promise(() => undefined);
      },
      { noAck: false },
    );

    await client.publish(EXCHANGE, 'task', { n: 1 }, { messageId: 'it-kill-1' });
    await entered;

    // the message is out of the queue but unacked: ready is empty
    expect((await raw.channel.checkQueue(QUEUE)).messageCount).toBe(0);

    // the consumer process dies: the connection drops without an ack
    await doomed.close().catch(() => undefined);

    // the broker puts the message back
    await waitFor(async () => (await raw.channel.checkQueue(QUEUE)).messageCount === 1, 20_000);

    const redelivered: boolean[] = [];
    await consume(async (message) => {
      redelivered.push(message.fields.redelivered);
      await client.ack(message);
    });

    await waitFor(async () => (await raw.channel.checkQueue(QUEUE)).messageCount === 0, 20_000);

    // the handler started once and never finished; the redelivery is marked as such
    expect(started).toBe(1);
    expect(redelivered).toEqual([true]);
  }, 90_000);

  test('a backlog of messages flows one at a time at prefetch 1, in order and exactly once', async () => {
    const total = 8;
    const handled: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;

    await consume(async (message) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      handled.push(message.properties.messageId ?? '');

      await Bun.sleep(100);

      inFlight -= 1;
      await client.ack(message);
    });

    const startedAt = Date.now();
    for (let n = 1; n <= total; n += 1) {
      await client.publish(EXCHANGE, 'task', { n }, { messageId: `it-stream-${n}` });
    }

    await waitFor(() => handled.length === total, 40_000);
    // пока последний handler не заакал, поток не закончен: мерим до слива очереди
    await waitFor(async () => (await raw.channel.checkQueue(QUEUE)).messageCount === 0, 20_000);
    const elapsed = Date.now() - startedAt;

    expect(handled).toEqual(Array.from({ length: total }, (_, index) => `it-stream-${index + 1}`));
    expect(maxInFlight).toBe(1);
    expect(elapsed).toBeGreaterThanOrEqual(total * 100);
    expect((await raw.channel.checkQueue(QUEUE)).messageCount).toBe(0);
  }, 90_000);

  test('survives a broker restart and re-subscribes its consumers (destructive)', async () => {
    const compose = ['docker', 'compose', '-f', 'infrastructure/docker/docker-compose.yml'];

    await consume(async (message) => {
      await client.ack(message);
    });

    Bun.spawnSync([...compose, 'stop', 'rabbitmq']);
    await Bun.sleep(3_000);

    expect(client.isConnected()).toBe(false);
    await expect(client.publish(EXCHANGE, 'task', { a: 1 }, { messageId: 'it-down-1' })).rejects.toThrow(
      /is not connected/,
    );

    Bun.spawnSync([...compose, 'start', 'rabbitmq']);

    await waitFor(() => client.isConnected(), 90_000);

    // the subscription came back with the reconnect: a new message is delivered
    const received: string[] = [];
    await consume(async (message) => {
      received.push(message.properties.messageId ?? '');
      await client.ack(message);
    });

    await waitFor(async () => {
      try {
        await client.publish(EXCHANGE, 'task', { a: 1 }, { messageId: 'it-up-1' });
        return received.includes('it-up-1');
      } catch {
        return false;
      }
    }, 60_000);
  }, 180_000);
});
