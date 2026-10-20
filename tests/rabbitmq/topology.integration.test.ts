/**
 * Integration test of the whole RabbitMQ topology against the real broker:
 * every service client initializes (which re-declares its queues with the exact
 * arguments from the code — a drift against the running broker fails here with
 * 406), all expected queues exist, and the fan-out semantics the signing flow
 * relies on hold for a direct exchange.
 *
 * The stack must be up (`bun run app:up`). Run:
 *
 *   bun --env-file=infrastructure/docker/.env test --timeout=120000 \
 *     tests/rabbitmq/topology.integration.test.ts
 *
 * This file never publishes into the queues of the running services: only
 * throw-away objects with a per-run suffix are written to and deleted.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { connect } from 'amqplib';
import type { ChannelModel, ConfirmChannel } from 'amqplib';
import { RabbitMQClient as RwaClient } from '../../services/rwa/src/clients/rabbitmq.client';
import { RabbitMQClient as ChartsClient } from '../../services/charts/src/clients/rabbitmq.client';
import { RabbitMQClient as DaoClient } from '../../services/dao/src/clients/rabbitmq.client';
import { RabbitMQClient as LoyaltyClient } from '../../services/loyalty/src/clients/rabbitmq.client';
import { RabbitMQClient as PortfolioClient } from '../../services/portfolio/src/clients/rabbitmq.client';
import { RabbitMQClient as SignerClient } from '../../services/signer/src/clients/rabbitmq.client';
import { RabbitMQClient as SignersManagerClient } from '../../services/signers-manager/src/clients/rabbitmq.client';
import { RabbitMQClient as AiEvaluatorClient } from '../../services/ai-evaluator/src/clients/rabbitmq.client';
import { RabbitMQClient as BlockchainScannerClient } from '../../services/blockchain-scanner/src/clients/rabbitmq.client';

const user = process.env.RABBITMQ_DEFAULT_USER;
const password = process.env.RABBITMQ_PASSWORD;
const host = process.env.RABBITMQ_HOST ?? '127.0.0.1';
const port = process.env.RABBITMQ_PORT ?? '5672';

if (!user || !password) {
  throw new Error(
    'RABBITMQ_DEFAULT_USER / RABBITMQ_PASSWORD are not set — run: ' +
      'bun --env-file=infrastructure/docker/.env test tests/rabbitmq/topology.integration.test.ts',
  );
}

const URI = `amqp://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}`;

/** The signer queue name is SERVICE_NAME, so the test reads the same variables. */
const SIGNER_NAMES = [
  process.env.SIGNER_1_SERVICE_NAME ?? 'signer-1',
  process.env.SIGNER_2_SERVICE_NAME ?? 'signer-2',
  process.env.SIGNER_3_SERVICE_NAME ?? 'signer-3',
];

async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error(`waitFor: the condition was not met within ${timeoutMs}ms`);
    await Bun.sleep(100);
  }
}

describe('RabbitMQ topology over the real broker', () => {
  const clients = [
    new RwaClient(URI),
    new ChartsClient(URI),
    new DaoClient(URI),
    new LoyaltyClient(URI),
    new PortfolioClient(URI),
    ...SIGNER_NAMES.map((name) => new SignerClient(URI, name)),
    new SignersManagerClient(URI),
    new AiEvaluatorClient(URI),
    new BlockchainScannerClient(URI),
  ];

  let raw: { connection: ChannelModel; channel: ConfirmChannel };

  beforeAll(async () => {
    const connection = await connect(URI, { heartbeat: 5 });
    connection.on('error', () => undefined);
    const channel = await connection.createConfirmChannel();
    channel.on('error', () => undefined);

    raw = { connection, channel };
  });

  afterAll(async () => {
    for (const client of clients) await client.disconnect();
    await raw?.connection.close().catch(() => undefined);
  });

  test('every service declares its topology on the live broker without a 406', async () => {
    for (const client of clients) {
      await client.initialize();
      expect(client.isConnected()).toBe(true);
    }
  }, 60_000);

  test('all consumer queues exist with their retry/parked companions', async () => {
    const alwaysRetry = [
      'blockchain.events.rwa',
      'blockchain.events.charts',
      'blockchain.events.dao',
      'blockchain.events.loyalty',
      'blockchain.events.portfolio',
    ];
    const finite = [
      'evaluation.results',
      'sign.responses',
      ...SIGNER_NAMES.map((name) => `sign.requests.${name}`),
    ];

    for (const queue of alwaysRetry) {
      expect((await raw.channel.checkQueue(queue)).queue).toBe(queue);
    }

    for (const queue of finite) {
      expect((await raw.channel.checkQueue(queue)).queue).toBe(queue);
      expect((await raw.channel.checkQueue(`${queue}.retry`)).queue).toBe(`${queue}.retry`);
      expect((await raw.channel.checkQueue(`${queue}.parked`)).queue).toBe(`${queue}.parked`);
    }
  }, 30_000);

  test('the infinite-policy queues have no retry/parked companions', async () => {
    // a 404 is a channel-level error and closes the channel: each probe gets its own
    async function expectMissing(queue: string): Promise<void> {
      const connection = await connect(URI, { heartbeat: 5 });
      connection.on('error', () => undefined);
      const channel = await connection.createConfirmChannel();
      channel.on('error', () => undefined);

      try {
        await expect(channel.checkQueue(queue)).rejects.toThrow(/NOT_FOUND/);
      } finally {
        await connection.close().catch(() => undefined);
      }
    }

    for (const queue of [
      'blockchain.events.rwa',
      'blockchain.events.charts',
      'blockchain.events.dao',
      'blockchain.events.loyalty',
      'blockchain.events.portfolio',
    ]) {
      await expectMissing(`${queue}.retry`);
      await expectMissing(`${queue}.parked`);
    }
  }, 60_000);

  test('a direct exchange with one routing key delivers a copy to every bound queue (the sign flow)', async () => {
    const run = `${process.pid}-${Date.now()}`;
    const exchange = `it.fanout.exchange.${run}`;
    const queues = [1, 2, 3].map((index) => `it.fanout.queue.${index}.${run}`);

    // durable on purpose: RabbitMQ 4.x rejects transient non-exclusive queues
    // (deprecated_features.permit.transient_nonexcl_queues is off by default) and
    // closes the whole connection on such a declare
    await raw.channel.assertExchange(exchange, 'direct', { durable: true });

    try {
      for (const queue of queues) {
        await raw.channel.assertQueue(queue, { durable: true });
        await raw.channel.bindQueue(queue, exchange, 'task');
      }

      raw.channel.publish(exchange, 'task', Buffer.from(JSON.stringify({ taskId: 'it-fanout' })), {
        messageId: 'it-fanout-1',
      });
      await raw.channel.waitForConfirms();

      for (const queue of queues) {
        await waitFor(async () => (await raw.channel.checkQueue(queue)).messageCount === 1, 10_000);
      }

      // a key nobody bound is returned to the publisher (mandatory publish)
      const returned: string[] = [];
      const probe = await connect(URI, { heartbeat: 5 });
      probe.on('error', () => undefined);
      const probeChannel = await probe.createConfirmChannel();
      probeChannel.on('error', () => undefined);
      probeChannel.on('return', (message) => void returned.push(message.fields.routingKey));

      probeChannel.publish(exchange, 'nobody_binds_this', Buffer.from('{}'), { mandatory: true, messageId: 'it-fanout-2' });
      await probeChannel.waitForConfirms();
      await waitFor(() => returned.includes('nobody_binds_this'), 10_000);

      await probe.close().catch(() => undefined);
    } finally {
      for (const queue of queues) {
        await raw.channel.deleteQueue(queue).catch(() => undefined);
      }
      await raw.channel.deleteExchange(exchange).catch(() => undefined);
    }
  }, 60_000);

  test('the evaluation exchange is declared identically by the producer and the consumer', () => {
    const producer = clients.find((client) => client.channelName === 'ai-evaluator')!;
    const consumer = clients.find((client) => client.channelName === 'rwa')!;

    const producerTopology = producer.getTopologyDefinition() as unknown as {
      exchanges: Record<string, { type: string; options?: Record<string, unknown> }>;
      queues: Record<string, { bindings: Record<string, readonly string[]> }>;
    };
    const consumerTopology = consumer.getTopologyDefinition() as unknown as typeof producerTopology;

    const producerExchange = producerTopology.exchanges.evaluation;
    const consumerExchange = consumerTopology.exchanges.evaluation;

    expect(producerExchange).toEqual(consumerExchange);
    expect(consumerTopology.queues['evaluation.results'].bindings.evaluation).toEqual([
      'poolResult',
      'businessResult',
    ]);
  });
});
