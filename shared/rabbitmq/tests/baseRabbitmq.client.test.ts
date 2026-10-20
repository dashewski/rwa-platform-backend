/**
 * Unit tests for BaseRabbitMQClient — the transport every service sits on.
 *
 * There is no broker here: `amqplib.connect` is replaced by an in-memory fake
 * (see ./fakes.ts), so the tests drive the client through every branch that
 * matters for reliability:
 *   - publish: confirm, mandatory return, timeout, serialization, disconnected;
 *   - consume: consumer tag, prefetch, resubscribe after a reconnect;
 *   - topology: exchanges, main queue, `<queue>.retry`, `<queue>.parked`,
 *     bindings, merging of the queue's own arguments;
 *   - lifecycle: idempotent initialize, reconnect on close, boot without a
 *     broker, disconnect that stops the reconnect loop.
 */
import './setup';
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createFakeBroker, makeAmqpMessage, type FakeBroker } from './fakes';

const broker: FakeBroker = createFakeBroker();

// The client imports `connect` from 'amqplib' at module scope, so the mock has
// to be installed before the module under test is loaded.
mock.module('amqplib', () => ({ connect: broker.connect }));

const { BaseRabbitMQClient } = await import('../src/baseRabbitmq.client');
const { logger } = await import('@shared/monitoring/src/monitoring.plugin');

const EXCHANGE = 'test.exchange';
const QUEUE = 'test.queue';

class TestClient extends BaseRabbitMQClient {
  constructor(name = 'test-service', reconnectDelayMs = 1) {
    super('amqp://guest:guest@localhost:5672', name, reconnectDelayMs);
  }

  getTopologyDefinition() {
    return {
      exchanges: {
        [EXCHANGE]: { type: 'direct' as const, options: { durable: true } },
      },
      queues: {
        [QUEUE]: {
          options: { durable: true },
          deferAfterAttempts: 3,
          parkAfterCycles: 2,
          bindings: { [EXCHANGE]: ['task', 'response'] as const },
        },
      },
    } as const;
  }
}

/** A client whose queue carries its own arguments (signer: x-message-ttl). */
class ClientWithQueueArguments extends BaseRabbitMQClient {
  constructor() {
    super('amqp://guest:guest@localhost:5672', 'signer-1', 1);
  }

  getTopologyDefinition() {
    return {
      exchanges: { 'sign.exchange': { type: 'direct' as const, options: { durable: true } } },
      queues: {
        'sign.requests.signer-1': {
          options: { durable: true, arguments: { 'x-message-ttl': 900_000 } },
          deferAfterAttempts: 3,
          parkAfterCycles: 3,
          bindings: { 'sign.exchange': ['task'] as const },
        },
      },
    } as const;
  }
}

/** A client with queues that never retry and never park (blockchain events). */
class InfinitePolicyClient extends BaseRabbitMQClient {
  constructor() {
    super('amqp://guest:guest@localhost:5672', 'rwa', 1);
  }

  getTopologyDefinition() {
    return {
      exchanges: { 'blockchain.events': { type: 'direct' as const, options: { durable: true } } },
      queues: {
        'blockchain.events.rwa': {
          options: { durable: true },
          deferAfterAttempts: Number.POSITIVE_INFINITY,
          parkAfterCycles: Number.POSITIVE_INFINITY,
          bindings: { 'blockchain.events': ['RWA_Deployed', 'RWA_Transfer'] as const },
        },
      },
    } as const;
  }
}

/** A client whose exchange keeps unroutable messages in a quarantine queue. */
class ClientWithUnroutedExchange extends BaseRabbitMQClient {
  constructor() {
    super('amqp://guest:***@localhost:5672', 'scanner', 1);
  }

  getTopologyDefinition() {
    return {
      exchanges: {
        'blockchain.events': {
          type: 'direct' as const,
          options: { durable: true },
          allowUnrouted: true,
        },
      },
      queues: {},
    } as const;
  }
}

/** A client whose topology throws on the first declaration only. */
class FailOnceClient extends BaseRabbitMQClient {
  private calls = 0;

  constructor() {
    super('amqp://guest:guest@localhost:5672', 'flaky', 1);
  }

  getTopologyDefinition() {
    this.calls += 1;

    if (this.calls === 1) {
      throw new Error('PRECONDITION_FAILED - inequivalent arg');
    }

    return { exchanges: {}, queues: {} } as const;
  }
}

/** A client with an empty topology (the base default). */
class EmptyTopologyClient extends BaseRabbitMQClient {
  constructor() {
    super('amqp://guest:guest@localhost:5672', 'empty', 1);
  }
}

async function waitFor(predicate: () => boolean, timeoutMs = 300): Promise<void> {
  const startedAt = Date.now();

  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error('waitFor: the condition was not met in time');
    await Bun.sleep(2);
  }
}

let logs: string[] = [];
const original = { warn: logger.warn, error: logger.error, info: logger.info };

function formatLogArg(arg: unknown): string {
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  if (typeof arg === 'string') return arg;
  if (arg && typeof arg === 'object' && 'error' in arg) return formatLogArg((arg as { error: unknown }).error);

  try {
    return JSON.stringify(arg) ?? String(arg);
  } catch {
    return String(arg);
  }
}

function captureLogs(): void {
  logs = [];
  const push = (...args: unknown[]): void => void logs.push(args.map(formatLogArg).join(' '));

  logger.warn = push as typeof logger.warn;
  logger.error = push as typeof logger.error;
  logger.info = push as typeof logger.info;
}

function restoreLogs(): void {
  logger.warn = original.warn;
  logger.error = original.error;
  logger.info = original.info;
}

describe('BaseRabbitMQClient (unit, fake amqplib)', () => {
  let client: TestClient;

  beforeEach(() => {
    broker.state.connectCalls.length = 0;
    broker.state.connections.length = 0;
    broker.state.failNextConnect = null;
    broker.state.failAllConnects = null;
    client = new TestClient();
    captureLogs();
  });

  afterEach(async () => {
    await client.disconnect();
    restoreLogs();
  });

  afterAll(() => {
    mock.restore();
  });

  describe('initialize / connect', () => {
    test('initialize opens one confirm channel with the configured heartbeat', async () => {
      await client.initialize();

      expect(broker.state.connectCalls).toHaveLength(1);
      expect(broker.state.connectCalls[0]).toEqual({
        uri: 'amqp://guest:guest@localhost:5672',
        options: { heartbeat: 5 },
      });
      expect(client.isConnected()).toBe(true);
    });

    test('initialize is idempotent: a second call does not open another connection', async () => {
      await client.initialize();
      await client.initialize();

      expect(broker.state.connectCalls).toHaveLength(1);
    });

    test('a broker that is down does not reject initialize — the client reconnects in the background', async () => {
      broker.state.failNextConnect = new Error('ECONNREFUSED 127.0.0.1:5672');

      await client.initialize();

      expect(client.isConnected()).toBe(false);
      expect(broker.state.connectCalls).toHaveLength(1);

      await waitFor(() => client.isConnected());

      expect(broker.state.connectCalls).toHaveLength(2);
      expect(logs.some((line) => line.includes('connect or topology setup failed'))).toBe(true);
    });

    test('a failing topology declaration closes the socket and reconnects (e.g. 406 after an argument change)', async () => {
      const flaky = new FailOnceClient();

      await flaky.initialize();
      await waitFor(() => flaky.isConnected());

      expect(broker.state.connectCalls).toHaveLength(2);
      expect(logs.some((line) => line.includes('inequivalent arg'))).toBe(true);

      await flaky.disconnect();
    });

    test('a channel close schedules a reconnect', async () => {
      await client.initialize();
      const first = broker.connection;

      await first.channel.close();

      expect(client.isConnected()).toBe(false);
      await waitFor(() => client.isConnected());

      expect(broker.state.connectCalls).toHaveLength(2);
      expect(broker.connection).not.toBe(first);
    });

    test('disconnect closes the socket and stops the reconnect loop', async () => {
      await client.initialize();
      const channel = broker.channel;
      const connection = broker.connection;

      await client.disconnect();

      expect(channel.closed).toBe(true);
      expect(connection.closed).toBe(true);
      expect(client.isConnected()).toBe(false);

      await Bun.sleep(20);

      expect(broker.state.connectCalls).toHaveLength(1);
    });
  });

  describe('publish', () => {
    test('publishes a JSON body as a persistent mandatory message and waits for the confirm', async () => {
      await client.initialize();

      await client.publish(EXCHANGE, 'task', { a: 1 }, { messageId: 'id-1' });

      const published = broker.channel.published[0];

      expect(published.exchange).toBe(EXCHANGE);
      expect(published.routingKey).toBe('task');
      expect(published.body.toString()).toBe('{"a":1}');
      expect(published.options).toMatchObject({
        persistent: true,
        contentType: 'application/json',
        mandatory: true,
        messageId: 'id-1',
      });
      expect(published.settled).toBe(true);
    });

    test('explicit options win over the defaults', async () => {
      await client.initialize();

      await client.publish(EXCHANGE, 'task', { a: 1 }, { expiration: '1000', persistent: false });

      expect(broker.channel.published[0].options).toMatchObject({ expiration: '1000', persistent: false });
    });

    test('a disconnected client rejects instead of silently dropping the message', async () => {
      // no initialize: the channel is null
      await expect(client.publish(EXCHANGE, 'task', { a: 1 }, { messageId: 'id-1' })).rejects.toThrow(
        /is not connected: message to "test.exchange" was not published/,
      );
    });

    test('a negative confirm rejects the publish', async () => {
      await client.initialize();
      broker.channel.onPublish = (message) => message.confirm(new Error('nack from broker'));

      await expect(client.publish(EXCHANGE, 'task', { a: 1 }, { messageId: 'id-1' })).rejects.toThrow('nack from broker');
    });

    test('a channel that closes before the confirm rejects the publish', async () => {
      await client.initialize();
      broker.channel.onPublish = () => undefined; // confirm never arrives

      const publishing = client.publish(EXCHANGE, 'task', { a: 1 }, { messageId: 'id-1' });
      await broker.channel.close();

      await expect(publishing).rejects.toThrow(/channel closed before the message to "test.exchange" was confirmed/);
    });

    test('a returned message (no queue bound) rejects the publish of the sender', async () => {
      await client.initialize();
      broker.channel.onPublish = (message) => {
        broker.channel.emitReturn({
          properties: { messageId: message.options.messageId as string },
          fields: { routingKey: message.routingKey, exchange: message.exchange },
        });
      };

      await expect(client.publish(EXCHANGE, 'unknown_event', { a: 1 }, { messageId: 'id-1' })).rejects.toThrow(
        /no queue is bound to routing key "unknown_event" on exchange "test.exchange"/,
      );
    });

    test('a returned message without messageId cannot be correlated: the publish is considered successful', async () => {
      await client.initialize();
      broker.channel.onPublish = (message) => {
        broker.channel.emitReturn({
          properties: {},
          fields: { routingKey: message.routingKey, exchange: message.exchange },
        });
        message.confirm(null);
      };

      await client.publish(EXCHANGE, 'unknown_event', { a: 1 });

      expect(logs.some((line) => line.includes('was returned but is not awaited by any publisher'))).toBe(true);
    });

    test('a return only rejects the publish it belongs to', async () => {
      await client.initialize();
      broker.channel.onPublish = (message) => {
        if (message.routingKey === 'lost') {
          broker.channel.emitReturn({
            properties: { messageId: message.options.messageId as string },
            fields: { routingKey: message.routingKey, exchange: message.exchange },
          });
          return;
        }

        message.confirm(null);
      };

      const lost = client.publish(EXCHANGE, 'lost', { a: 1 }, { messageId: 'lost-1' });
      const fine = client.publish(EXCHANGE, 'fine', { a: 2 }, { messageId: 'fine-1' });

      await expect(lost).rejects.toThrow('no queue is bound');
      await expect(fine).resolves.toBeUndefined();
    });

    test('a payload JSON cannot represent is rejected before anything reaches the channel', async () => {
      await client.initialize();

      await expect(client.publish(EXCHANGE, 'task', { amount: 10n }, { messageId: 'id-1' })).rejects.toThrow(
        /BigInt/,
      );
      expect(broker.channel.published).toHaveLength(0);
    });

    test('an undefined payload is rejected before anything reaches the channel', async () => {
      await client.initialize();

      await expect(client.publish(EXCHANGE, 'task', undefined, { messageId: 'id-1' })).rejects.toThrow();
      expect(broker.channel.published).toHaveLength(0);
    });

    test('a confirm that never arrives times out after 10s', async () => {
      await client.initialize();
      broker.channel.onPublish = () => undefined;

      const realSetTimeout = globalThis.setTimeout;
      const scheduled: number[] = [];

      // Compress the 10s confirm timer: the client still asks for 10_000ms.
      globalThis.setTimeout = ((handler: () => void, ms?: number) => {
        scheduled.push(Number(ms));
        return realSetTimeout(handler, 0);
      }) as unknown as typeof globalThis.setTimeout;

      try {
        await expect(client.publish(EXCHANGE, 'task', { a: 1 }, { messageId: 'id-1' })).rejects.toThrow(
          /was not confirmed timeout/,
        );
      } finally {
        globalThis.setTimeout = realSetTimeout;
      }

      expect(scheduled).toContain(10_000);
    });

    test('park publishes to the default exchange with the queue name as routing key', async () => {
      await client.initialize();

      await client.park(`${QUEUE}.parked`, { a: 1 }, { messageId: 'id-1' });

      expect(broker.channel.published[0]).toMatchObject({
        exchange: '',
        routingKey: `${QUEUE}.parked`,
      });
    });
  });

  describe('consume', () => {
    test('a consumer tag is channel-scoped and the prefetch is applied per consumer', async () => {
      const handler = mock(async () => undefined);
      const tag = await client.consume(QUEUE, handler, { prefetch: 1 });

      await client.initialize();

      expect(tag.startsWith(`${'test-service'}.${QUEUE}.`)).toBe(true);
      expect(broker.channel.consumed).toEqual([{ queue: QUEUE, options: { consumerTag: tag, noAck: false } }]);
      expect(broker.channel.prefetches).toEqual([{ count: 1, global: false }]);
    });

    test('noAck can be requested explicitly', async () => {
      await client.consume(QUEUE, async () => undefined, { noAck: true });
      await client.initialize();

      expect(broker.channel.consumed[0].options).toMatchObject({ noAck: true });
    });

    test('without prefetch the channel keeps the broker default', async () => {
      await client.consume(QUEUE, async () => undefined);
      await client.initialize();

      expect(broker.channel.prefetches).toEqual([]);
    });

    test('a consumer registered before the connection is subscribed as soon as the socket opens', async () => {
      broker.state.failNextConnect = new Error('ECONNREFUSED');
      const handler = mock(async () => undefined);

      await client.consume(QUEUE, handler, { prefetch: 1 });
      await client.initialize();

      expect(broker.state.connections).toHaveLength(0);

      await waitFor(() => client.isConnected());

      expect(broker.channel.consumed).toHaveLength(1);
      expect(broker.channel.consumed[0].queue).toBe(QUEUE);
    });

    test('every consumer is re-subscribed after a reconnect', async () => {
      await client.consume(QUEUE, async () => undefined, { prefetch: 1 });
      await client.initialize();

      expect(broker.channel.consumed).toHaveLength(1);

      await broker.channel.close();
      await waitFor(() => client.isConnected());

      expect(broker.channel.consumed).toHaveLength(1);
      expect(broker.channel.prefetches).toEqual([{ count: 1, global: false }]);
    });

    test('a cancelled consumer is not re-subscribed after a reconnect', async () => {
      const tag = await client.consume(QUEUE, async () => undefined, { prefetch: 1 });
      await client.initialize();

      await client.cancelConsumer(tag);
      expect(broker.channel.cancelled).toEqual([tag]);

      await broker.channel.close();
      await waitFor(() => client.isConnected());

      expect(broker.channel.consumed).toHaveLength(0);
    });

    test('a delivered message reaches the handler', async () => {
      const handler = mock(async () => undefined);
      await client.consume(QUEUE, handler, { prefetch: 1 });
      await client.initialize();

      const message = makeAmqpMessage('id-1');
      broker.channel.consumerHandler!(message);
      await Bun.sleep(0);

      expect(handler).toHaveBeenCalledWith(message);
    });

    test('a handler failure is logged, not thrown into the channel callback', async () => {
      const handler = mock(async () => {
        throw new Error('handler exploded');
      });
      await client.consume(QUEUE, handler, { prefetch: 1 });
      await client.initialize();

      expect(() => broker.channel.consumerHandler!(makeAmqpMessage('id-1'))).not.toThrow();
      await Bun.sleep(0);

      expect(logs.some((line) => line.includes('consumer') && line.includes('handler failed'))).toBe(true);
    });

    test('a null message (consumer cancelled by the broker) is ignored', async () => {
      const handler = mock(async () => undefined);
      await client.consume(QUEUE, handler, { prefetch: 1 });
      await client.initialize();

      broker.channel.consumerHandler!(null);
      await Bun.sleep(0);

      expect(handler).not.toHaveBeenCalled();
    });

    test('cancelling an unknown consumer tag is a no-op', async () => {
      await client.initialize();

      await client.cancelConsumer('does-not-exist');

      expect(broker.channel.cancelled).toEqual([]);
    });
  });

  describe('ack / nack', () => {
    test('ack reaches the channel', async () => {
      await client.initialize();
      const message = makeAmqpMessage('id-1');

      await client.ack(message);

      expect(broker.channel.acked).toEqual([message]);
    });

    test('a failing ack is logged, not thrown (the broker will redeliver anyway)', async () => {
      await client.initialize();
      broker.channel.failAck = new Error('IllegalOperationError: Channel closed');

      await client.ack(makeAmqpMessage('id-1'));

      expect(logs.some((line) => line.includes('ack failed'))).toBe(true);
    });

    test('nack requeues by default and can dead-letter on request', async () => {
      await client.initialize();
      const first = makeAmqpMessage('id-1');
      const second = makeAmqpMessage('id-2');

      await client.nack(first);
      await client.nack(second, false);

      expect(broker.channel.nacked).toEqual([
        { message: first, requeue: true },
        { message: second, requeue: false },
      ]);
    });

    test('a failing nack is logged, not thrown', async () => {
      await client.initialize();
      broker.channel.failNack = new Error('IllegalOperationError: Channel closed');

      await client.nack(makeAmqpMessage('id-1'), false);

      expect(logs.some((line) => line.includes('nack failed'))).toBe(true);
    });
  });

  describe('topology', () => {
    test('the exchange, the retry queue and the parked queue are declared with the documented arguments', async () => {
      await client.initialize();

      expect(broker.channel.assertedExchanges).toEqual([
        { name: EXCHANGE, type: 'direct', options: { durable: true } },
      ]);
      expect(broker.channel.assertedQueues).toEqual([
        {
          name: QUEUE,
          options: {
            durable: true,
            arguments: {
              'x-dead-letter-exchange': '',
              'x-dead-letter-routing-key': `${QUEUE}.retry`,
            },
          },
        },
        {
          name: `${QUEUE}.retry`,
          options: {
            durable: true,
            arguments: {
              'x-message-ttl': 30_000,
              'x-dead-letter-exchange': '',
              'x-dead-letter-routing-key': QUEUE,
            },
          },
        },
        { name: `${QUEUE}.parked`, options: { durable: true } },
      ]);
      expect(broker.channel.bindings).toEqual([
        { queue: QUEUE, exchange: EXCHANGE, routingKey: 'task' },
        { queue: QUEUE, exchange: EXCHANGE, routingKey: 'response' },
      ]);
    });

    test('the queue own arguments are merged with the dead-letter arguments', async () => {
      const signer = new ClientWithQueueArguments();

      await signer.initialize();

      expect(broker.channel.assertedQueues[0].options).toEqual({
        durable: true,
        arguments: {
          'x-message-ttl': 900_000,
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': 'sign.requests.signer-1.retry',
        },
      });

      await signer.disconnect();
    });

    test('infinite retry policy declares a single plain queue: no retry, no parked', async () => {
      const rwa = new InfinitePolicyClient();

      await rwa.initialize();

      expect(broker.channel.assertedQueues).toEqual([{ name: 'blockchain.events.rwa', options: { durable: true } }]);
      expect(broker.channel.bindings.map((binding) => binding.routingKey)).toEqual(['RWA_Deployed', 'RWA_Transfer']);

      await rwa.disconnect();
    });

    test('an exchange with allowUnrouted gets a fanout quarantine and the alternate-exchange argument', async () => {
      const scanner = new ClientWithUnroutedExchange();

      await scanner.initialize();

      expect(broker.channel.assertedExchanges).toEqual([
        { name: 'blockchain.events.unrouted', type: 'fanout', options: { durable: true } },
        {
          name: 'blockchain.events',
          type: 'direct',
          options: { durable: true, arguments: { 'alternate-exchange': 'blockchain.events.unrouted' } },
        },
      ]);
      expect(broker.channel.assertedQueues).toEqual([
        { name: 'blockchain.events.unrouted', options: { durable: true } },
      ]);
      expect(broker.channel.bindings).toEqual([
        { queue: 'blockchain.events.unrouted', exchange: 'blockchain.events.unrouted', routingKey: '' },
      ]);

      await scanner.disconnect();
    });

    test('an exchange without allowUnrouted declares no quarantine and no arguments', async () => {
      const signer = new ClientWithQueueArguments();

      await signer.initialize();

      expect(broker.channel.assertedExchanges).toEqual([
        { name: 'sign.exchange', type: 'direct', options: { durable: true } },
      ]);
      expect(broker.channel.assertedQueues.map((queue) => queue.name)).not.toContain('sign.exchange.unrouted');
      expect(broker.channel.bindings.every((binding) => binding.exchange === 'sign.exchange')).toBe(true);

      await signer.disconnect();
    });

    test('an empty topology declares nothing', async () => {
      const empty = new EmptyTopologyClient();

      await empty.initialize();

      expect(broker.channel.assertedExchanges).toEqual([]);
      expect(broker.channel.assertedQueues).toEqual([]);
      expect(broker.channel.bindings).toEqual([]);

      await empty.disconnect();
    });

    test('the topology helpers expose exactly what the topology defines', () => {
      expect(client.getExchanges()).toEqual([EXCHANGE]);
      expect(client.isExchangeRegistered(EXCHANGE)).toBe(true);
      expect(client.isExchangeRegistered('other.exchange')).toBe(false);
      expect(client.getQueueDeferAfterAttempts(QUEUE)).toBe(3);
      expect(client.getQueueParkAfterCycles(QUEUE)).toBe(2);
      expect(client.getQueueDeferAfterAttempts('unknown.queue')).toBeUndefined();
      expect(client.getExchange(EXCHANGE)).toBe(EXCHANGE);
      expect(client.getQueue(QUEUE)).toBe(QUEUE);
    });
  });
});
