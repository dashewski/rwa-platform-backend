/**
 * Unit tests for the portfolio InboxConsumerDaemon — routing only.
 *
 * The daemon extends the shared BaseInboxConsumerDaemon: it declares the
 * `blockchain.events.portfolio` queue, the prefetch and the routing table that
 * maps every subscribed event name onto a PortfolioService method. The
 * RabbitMQ client and the consumer service are fakes, PortfolioService is a
 * fake: these tests need no database, no broker and no network.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { ConsumeMessage } from 'amqplib';
import { InboxConsumerDaemon } from '../src/daemons/inboxConsumer.daemon';
import type { RabbitMQClient } from '../src/clients/rabbitmq.client';
import type { InboxConsumerService } from '@shared/inbox-consumer';
import type { PortfolioService } from '../src/services/portfolio.service';
import { createFakePortfolioService, type FakePortfolioService } from './fakes/portfolio.service.fake';

const QUEUE = 'blockchain.events.portfolio';

const TRANSFER_DATA = {
  emittedFrom: '0x00000000000000000000000000000000000000aa', // rwa token address
  from: '0x00000000000000000000000000000000000000bb',
  to: '0x00000000000000000000000000000000000000cc',
  tokenId: '10',
  amount: '250',
  pool: '0x00000000000000000000000000000000000000dd',
};

const TRANSFER_EVENT = makeEvent('RWA_Transfer');

function makeEvent(name: string) {
  return {
    chainId: '31337',
    name,
    blockNumber: 42,
    transactionHash: '0xtx1',
    address: '0x00000000000000000000000000000000000000aa',
    logIndex: 0,
    data: { ...TRANSFER_DATA },
    timestamp: 1_700_000_000,
  };
}

function makeMessage(routingKey: string, body: unknown, options: { raw?: string } = {}): ConsumeMessage {
  return {
    content: Buffer.from(options.raw ?? JSON.stringify(body)),
    fields: { routingKey, redelivered: false, deliveryTag: 1, exchange: 'blockchain.events', consumerTag: 'ctag' },
    properties: { messageId: '31337:0xtx1:0' },
  } as unknown as ConsumeMessage;
}

/** RabbitMQ client stub: keeps the callback consume() was given. */
function createFakeRabbitClient() {
  const state = {
    consumed: [] as Array<{ queue: string; options: unknown }>,
    acked: [] as ConsumeMessage[],
    nacked: [] as Array<{ message: ConsumeMessage; requeue: boolean }>,
    cancelled: [] as string[],
    parked: [] as Array<{ queue: string; payload: unknown }>,
    deferAfterAttempts: Number.POSITIVE_INFINITY,
    parkAfterCycles: Number.POSITIVE_INFINITY,
    connected: true,
    handler: null as null | ((message: ConsumeMessage | null) => Promise<void>),
  };

  const client = {
    state,

    park: mock(async (queue: string, payload: unknown, _options?: { messageId?: string }) => {
      state.parked.push({ queue, payload });
    }),

    getQueueDeferAfterAttempts: mock(() => state.deferAfterAttempts),
    getQueueParkAfterCycles: mock(() => state.parkAfterCycles),

    consume: mock(async (queue: string, handler: (message: ConsumeMessage | null) => Promise<void>, options: unknown) => {
      state.consumed.push({ queue, options });
      state.handler = handler;
      return `ctag-${state.consumed.length}`;
    }),

    cancelConsumer: mock(async (consumerTag: string) => {
      state.cancelled.push(consumerTag);
    }),

    ack: mock(async (message: ConsumeMessage) => {
      state.acked.push(message);
    }),

    nack: mock(async (message: ConsumeMessage, requeue = true) => {
      state.nacked.push({ message, requeue });
    }),

    isConnected: mock(() => state.connected),
  };

  return client;
}

/**
 * Consumer service stub: runs the delivery callback exactly like the real
 * service does inside its dedup transaction and reports the outcome the test
 * asked for.
 */
function createFakeConsumerService() {
  const state = {
    outcome: 'acked' as 'acked' | 'deferred',
    handlerError: null as unknown,
    deliveries: 0,
  };

  const service = {
    state,

    handle: mock(async (queueName: string, _message: ConsumeMessage, handler: () => Promise<void>) => {
      state.deliveries += 1;

      try {
        await handler();
      } catch (error) {
        state.handlerError = error;
      }
      return state.outcome;
    }),
  };

  return service;
}

describe('portfolio InboxConsumerDaemon (unit, fakes for client / consumer service / PortfolioService)', () => {
  let rabbit: ReturnType<typeof createFakeRabbitClient>;
  let consumerService: ReturnType<typeof createFakeConsumerService>;
  let portfolioService: FakePortfolioService;
  let daemon: InboxConsumerDaemon;

  beforeEach(() => {
    rabbit = createFakeRabbitClient();
    consumerService = createFakeConsumerService();
    portfolioService = createFakePortfolioService();
    daemon = new InboxConsumerDaemon(
      rabbit as unknown as RabbitMQClient,
      consumerService as unknown as InboxConsumerService,
      portfolioService as unknown as PortfolioService,
    );
  });

  async function deliver(routingKey: string, message: ConsumeMessage): Promise<void> {
    if (!rabbit.state.handler) throw new Error('the daemon never subscribed');
    await rabbit.state.handler(message);
  }

  test('subscribes only to the portfolio queue, with prefetch 1', async () => {
    await daemon.initialize();

    expect(rabbit.state.consumed).toEqual([{ queue: QUEUE, options: { prefetch: 1 } }]);
  });

  test('RWA_Transfer is forwarded to the service exactly as it arrived', async () => {
    await daemon.initialize();
    const event = makeEvent('RWA_Transfer');

    await deliver('RWA_Transfer', makeMessage('RWA_Transfer', event));

    // The daemon owns routing only: the event envelope plus the decoded data
    // reaches PortfolioService untouched, and the mapping onto the repository
    // shape happens inside the service.
    expect(portfolioService.processTransfer).toHaveBeenCalledTimes(1);
    expect(portfolioService.processTransfer).toHaveBeenCalledWith(event);
  });

  test('the forwarded event keeps its envelope and decoded data', async () => {
    await daemon.initialize();

    await deliver('RWA_Transfer', makeMessage('RWA_Transfer', makeEvent('RWA_Transfer')));

    const forwarded = portfolioService.processTransfer.mock.calls[0][0] as typeof TRANSFER_EVENT;
    expect(forwarded.chainId).toBe('31337');
    expect(forwarded.transactionHash).toBe('0xtx1');
    expect(forwarded.blockNumber).toBe(42);
    expect(forwarded.logIndex).toBe(0);
    expect(forwarded.data).toEqual(TRANSFER_DATA);
  });

  test('a successful delivery is acked and nothing is requeued', async () => {
    await daemon.initialize();

    await deliver('RWA_Transfer', makeMessage('RWA_Transfer', makeEvent('RWA_Transfer')));

    expect(rabbit.state.acked).toHaveLength(1);
    expect(rabbit.state.nacked).toHaveLength(0);
    expect(rabbit.state.cancelled).toEqual([]);
  });

  test('an event of another service (unknown routing key) never reaches the portfolio service', async () => {
    await daemon.initialize();

    await deliver('Pool_ReservesUpdated', makeMessage('Pool_ReservesUpdated', { emittedFrom: '0xpool' }));

    expect(portfolioService.processTransfer).toHaveBeenCalledTimes(0);
    expect(rabbit.state.acked).toHaveLength(1);
  });

  test('a service failure is not swallowed: the delivery is deferred to the retry queue', async () => {
    await daemon.initialize();
    consumerService.state.outcome = 'deferred';
    portfolioService.processTransfer.mockRejectedValueOnce(new Error('db is down'));

    await deliver('RWA_Transfer', makeMessage('RWA_Transfer', makeEvent('RWA_Transfer')));

    expect(consumerService.state.handlerError).toBeInstanceOf(Error);
    expect((consumerService.state.handlerError as Error).message).toBe('db is down');
    expect(rabbit.state.nacked).toHaveLength(1);
    expect(rabbit.state.nacked[0].requeue).toBe(false);
    expect(rabbit.state.acked).toHaveLength(0);
    // The subscription is not cancelled: the retry queue decides what happens next.
    expect(rabbit.state.cancelled).toEqual([]);
  });

  test('a malformed payload fails the delivery instead of silently dropping the event', async () => {
    await daemon.initialize();
    consumerService.state.outcome = 'deferred';

    await deliver('RWA_Transfer', makeMessage('RWA_Transfer', {}, { raw: '{"from":' }));

    expect(portfolioService.processTransfer).toHaveBeenCalledTimes(0);
    expect(consumerService.state.handlerError).toBeInstanceOf(Error);
    expect((consumerService.state.handlerError as Error).message).toContain('not valid JSON');
    expect(rabbit.state.nacked).toHaveLength(1);
  });

  test('stop cancels the consumer while the connection is alive', async () => {
    await daemon.initialize();

    await daemon.stop();

    expect(rabbit.state.cancelled).toEqual(['ctag-1']);
  });

  test('stop without a connection cancels nothing', async () => {
    await daemon.initialize();
    rabbit.state.connected = false;

    await daemon.stop();

    expect(rabbit.state.cancelled).toEqual([]);
  });
});
