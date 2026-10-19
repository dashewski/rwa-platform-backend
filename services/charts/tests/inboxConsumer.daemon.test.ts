/**
 * Unit tests for the charts InboxConsumerDaemon — routing only.
 *
 * The daemon extends the shared BaseInboxConsumerDaemon: it declares the
 * `blockchain.events.charts` queue, the prefetch and the routing table that
 * maps every subscribed event name onto a service method. The RabbitMQ client
 * and the consumer service are fakes, the services are fakes: these tests need
 * no database, no Redis, no broker and no network.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { ConsumeMessage } from 'amqplib';
import { InboxConsumerDaemon } from '../src/daemons/inboxConsumer.daemon';
import type { RabbitMQClient } from '../src/clients/rabbitmq.client';
import type { ChartsService } from '../src/services/charts.service';
import type { TransactionsService } from '../src/services/transactions.service';
import type { InboxConsumerService } from '@shared/inbox-consumer';

const QUEUE = 'blockchain.events.charts';
const POOL_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

const RESERVES_DATA = {
  emittedFrom: POOL_ADDRESS,
  realHoldReserve: '500',
  virtualHoldReserve: '1000',
  virtualRwaReserve: '4',
};

const MINT_DATA = {
  emittedFrom: POOL_ADDRESS,
  minter: '0x1234567890AbcdEF1234567890aBcdef12345678',
  rwaAmountMinted: '1000',
  holdAmountPaid: '1000',
  feePaid: '5',
};

const BURN_DATA = {
  emittedFrom: POOL_ADDRESS,
  burner: '0x1234567890AbcdEF1234567890aBcdef12345678',
  rwaAmountBurned: '1000',
  holdAmountReceived: '1000',
  bonusAmountReceived: '100',
  holdFeePaid: '5',
  bonusFeePaid: '3',
};

function makeEvent(name: string, data: Record<string, string>) {
  return {
    chainId: '1',
    name,
    transactionHash: '0xtx1',
    address: POOL_ADDRESS,
    logIndex: 0,
    blockNumber: 12_345,
    timestamp: 1_700_000_000,
    data: { ...data },
  };
}

function makeMessage(routingKey: string, body: unknown, options: { raw?: string } = {}): ConsumeMessage {
  return {
    content: Buffer.from(options.raw ?? JSON.stringify(body)),
    fields: { routingKey, redelivered: false, deliveryTag: 1, exchange: 'blockchain.events', consumerTag: 'ctag' },
    properties: { messageId: '1:0xtx1:0' },
  } as unknown as ConsumeMessage;
}

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

function createFakeChartsService() {
  return {
    recordPriceData: mock(async (_event: unknown): Promise<void> => {}),
  };
}

function createFakeTransactionsService() {
  return {
    recordMint: mock(async (_event: unknown): Promise<void> => {}),
    recordBurn: mock(async (_event: unknown): Promise<void> => {}),
  };
}

describe('charts InboxConsumerDaemon (unit, fakes for client / consumer service / services)', () => {
  let rabbit: ReturnType<typeof createFakeRabbitClient>;
  let consumerService: ReturnType<typeof createFakeConsumerService>;
  let chartsService: ReturnType<typeof createFakeChartsService>;
  let transactionsService: ReturnType<typeof createFakeTransactionsService>;
  let daemon: InboxConsumerDaemon;

  beforeEach(() => {
    rabbit = createFakeRabbitClient();
    consumerService = createFakeConsumerService();
    chartsService = createFakeChartsService();
    transactionsService = createFakeTransactionsService();
    daemon = new InboxConsumerDaemon(
      rabbit as unknown as RabbitMQClient,
      consumerService as unknown as InboxConsumerService,
      chartsService as unknown as ChartsService,
      transactionsService as unknown as TransactionsService,
    );
  });

  async function deliver(routingKey: string, message: ConsumeMessage): Promise<void> {
    if (!rabbit.state.handler) throw new Error('the daemon never subscribed');
    await rabbit.state.handler(message);
  }

  test('subscribes only to the charts queue, with prefetch 1', async () => {
    await daemon.initialize();

    expect(rabbit.state.consumed).toEqual([{ queue: QUEUE, options: { prefetch: 1 } }]);
  });

  test('Pool_ReservesUpdated goes to the price recording method with the event as-is', async () => {
    await daemon.initialize();
    const event = makeEvent('Pool_ReservesUpdated', RESERVES_DATA);

    await deliver('Pool_ReservesUpdated', makeMessage('Pool_ReservesUpdated', event));

    expect(chartsService.recordPriceData).toHaveBeenCalledTimes(1);
    expect(chartsService.recordPriceData).toHaveBeenCalledWith(event);
    expect(transactionsService.recordMint).toHaveBeenCalledTimes(0);
    expect(transactionsService.recordBurn).toHaveBeenCalledTimes(0);
  });

  test('Pool_RwaMinted goes to recordMint and Pool_RwaBurned to recordBurn — no cross-routing', async () => {
    await daemon.initialize();
    const mint = makeEvent('Pool_RwaMinted', MINT_DATA);
    const burn = makeEvent('Pool_RwaBurned', BURN_DATA);

    await deliver('Pool_RwaMinted', makeMessage('Pool_RwaMinted', mint));
    await deliver('Pool_RwaBurned', makeMessage('Pool_RwaBurned', burn));

    expect(transactionsService.recordMint).toHaveBeenCalledTimes(1);
    expect(transactionsService.recordMint).toHaveBeenCalledWith(mint);
    expect(transactionsService.recordBurn).toHaveBeenCalledTimes(1);
    expect(transactionsService.recordBurn).toHaveBeenCalledWith(burn);
    expect(chartsService.recordPriceData).toHaveBeenCalledTimes(0);
  });

  test('the forwarded event keeps its envelope and decoded data', async () => {
    await daemon.initialize();

    await deliver('Pool_RwaMinted', makeMessage('Pool_RwaMinted', makeEvent('Pool_RwaMinted', MINT_DATA)));

    const forwarded = transactionsService.recordMint.mock.calls[0][0] as {
      chainId: string;
      transactionHash: string;
      blockNumber: number;
      logIndex: number;
      data: Record<string, string>;
    };
    expect(forwarded.chainId).toBe('1');
    expect(forwarded.transactionHash).toBe('0xtx1');
    expect(forwarded.blockNumber).toBe(12_345);
    expect(forwarded.logIndex).toBe(0);
    expect(forwarded.data).toEqual(MINT_DATA);
  });

  test('a successful delivery is acked and nothing is requeued', async () => {
    await daemon.initialize();

    await deliver('Pool_ReservesUpdated', makeMessage('Pool_ReservesUpdated', makeEvent('Pool_ReservesUpdated', RESERVES_DATA)));

    expect(rabbit.state.acked).toHaveLength(1);
    expect(rabbit.state.nacked).toHaveLength(0);
    expect(rabbit.state.cancelled).toEqual([]);
  });

  test('an event of another service (unknown routing key) never reaches the charts services', async () => {
    await daemon.initialize();

    await deliver('RWA_Transfer', makeMessage('RWA_Transfer', { from: '0x1', to: '0x2' }));

    expect(chartsService.recordPriceData).toHaveBeenCalledTimes(0);
    expect(transactionsService.recordMint).toHaveBeenCalledTimes(0);
    expect(transactionsService.recordBurn).toHaveBeenCalledTimes(0);
    expect(rabbit.state.acked).toHaveLength(1);
  });

  test('a service failure is not swallowed: the delivery is deferred to the retry queue', async () => {
    await daemon.initialize();
    consumerService.state.outcome = 'deferred';
    chartsService.recordPriceData.mockRejectedValueOnce(new Error('virtualRwaReserve cannot be zero'));

    await deliver('Pool_ReservesUpdated', makeMessage('Pool_ReservesUpdated', makeEvent('Pool_ReservesUpdated', RESERVES_DATA)));

    expect(consumerService.state.handlerError).toBeInstanceOf(Error);
    expect((consumerService.state.handlerError as Error).message).toBe('virtualRwaReserve cannot be zero');
    expect(rabbit.state.nacked).toHaveLength(1);
    expect(rabbit.state.nacked[0].requeue).toBe(false);
    expect(rabbit.state.acked).toHaveLength(0);
    // The subscription is not cancelled: the retry queue decides what happens next.
    expect(rabbit.state.cancelled).toEqual([]);
  });

  test('a malformed payload fails the delivery instead of silently dropping the event', async () => {
    await daemon.initialize();
    consumerService.state.outcome = 'deferred';

    await deliver('Pool_RwaMinted', makeMessage('Pool_RwaMinted', {}, { raw: '{"data":' }));

    expect(transactionsService.recordMint).toHaveBeenCalledTimes(0);
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
