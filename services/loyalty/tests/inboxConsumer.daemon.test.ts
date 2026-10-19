/**
 * Unit tests for the loyalty InboxConsumerDaemon — routing only.
 *
 * The daemon extends the shared BaseInboxConsumerDaemon: it declares the
 * `blockchain.events.loyalty` queue, the prefetch and the routing table that
 * maps every subscribed event name onto a LoyaltyService method. The RabbitMQ
 * client and the consumer service are fakes, LoyaltyService is a fake: these
 * tests need no database, no broker and no network.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { ConsumeMessage } from 'amqplib';
import { InboxConsumerDaemon } from '../src/daemons/inboxConsumer.daemon';
import type { RabbitMQClient } from '../src/clients/rabbitmq.client';
import type { LoyaltyService } from '../src/services/loyalty.service';
import type { InboxConsumerService } from '@shared/inbox-consumer';

const QUEUE = 'blockchain.events.loyalty';

const ROUTING: Array<[string, keyof ReturnType<typeof createFakeLoyaltyService>]> = [
  ['Factory_CreateRWAFeeCollected', 'processCreateRWAFeeCollected'],
  ['Factory_CreatePoolFeeCollected', 'processCreatePoolFeeCollected'],
  ['Pool_RwaMinted', 'processRwaMinted'],
  ['Pool_RwaBurned', 'processRwaBurned'],
  ['ReferralTreasury_Withdrawn', 'processReferralTreasuryWithdrawn'],
];

const EVENT_DATA: Record<string, Record<string, unknown>> = {
  Factory_CreateRWAFeeCollected: {
    sender: '0x1111111111111111111111111111111111111111',
    amount: '1000000',
    token: '0x3333333333333333333333333333333333333333',
  },
  Factory_CreatePoolFeeCollected: {
    sender: '0x1111111111111111111111111111111111111111',
    amount: '2000000',
    token: '0x3333333333333333333333333333333333333333',
  },
  Pool_RwaMinted: {
    minter: '0x1111111111111111111111111111111111111111',
    rwaAmountMinted: '1000000000000000000',
    holdAmountPaid: '1000000000000000000',
    feePaid: '5000000',
    percentBefore: '0',
    userPercent: '1',
    targetReached: true,
    businessId: 'business-1',
    poolId: 'pool-1',
    holdToken: '0x3333333333333333333333333333333333333333',
  },
  Pool_RwaBurned: {
    burner: '0x1111111111111111111111111111111111111111',
    rwaAmountBurned: '1000000000000000000',
    holdAmountReceived: '900000',
    bonusAmountReceived: '100000',
    holdFeePaid: '3000000',
    bonusFeePaid: '1000000',
    percentBefore: '0',
    userPercent: '1',
    targetReached: true,
    businessId: 'business-1',
    poolId: 'pool-1',
    holdToken: '0x3333333333333333333333333333333333333333',
  },
  ReferralTreasury_Withdrawn: {
    user: '0x1111111111111111111111111111111111111111',
    token: '0x3333333333333333333333333333333333333333',
    amount: '700',
  },
};

function makeEvent(name: string) {
  return {
    chainId: '97',
    name,
    transactionHash: '0x' + 'ab'.repeat(32),
    address: '0xcf56E77069cC2aBfA6c1Df9bfD4155F782697B9D',
    logIndex: 7,
    blockNumber: 123_456,
    timestamp: 1_700_000_000,
    data: { ...EVENT_DATA[name] },
  };
}

function makeMessage(routingKey: string, body: unknown, options: { raw?: string } = {}): ConsumeMessage {
  return {
    content: Buffer.from(options.raw ?? JSON.stringify(body)),
    fields: { routingKey, redelivered: false, deliveryTag: 1, exchange: 'blockchain.events', consumerTag: 'ctag' },
    properties: { messageId: '97:0xab:7' },
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

    consume: mock(
      async (queue: string, handler: (message: ConsumeMessage | null) => Promise<void>, options: unknown) => {
        state.consumed.push({ queue, options });
        state.handler = handler;
        return `ctag-${state.consumed.length}`;
      },
    ),

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

function createFakeLoyaltyService() {
  return {
    processCreateRWAFeeCollected: mock(async (_event: unknown): Promise<void> => {}),
    processCreatePoolFeeCollected: mock(async (_event: unknown): Promise<void> => {}),
    processRwaMinted: mock(async (_event: unknown): Promise<void> => {}),
    processRwaBurned: mock(async (_event: unknown): Promise<void> => {}),
    processReferralTreasuryWithdrawn: mock(async (_event: unknown): Promise<void> => {}),
  };
}

describe('loyalty InboxConsumerDaemon (unit, fakes for client / consumer service / LoyaltyService)', () => {
  let rabbit: ReturnType<typeof createFakeRabbitClient>;
  let consumerService: ReturnType<typeof createFakeConsumerService>;
  let loyaltyService: ReturnType<typeof createFakeLoyaltyService>;
  let daemon: InboxConsumerDaemon;

  beforeEach(() => {
    rabbit = createFakeRabbitClient();
    consumerService = createFakeConsumerService();
    loyaltyService = createFakeLoyaltyService();
    daemon = new InboxConsumerDaemon(
      rabbit as unknown as RabbitMQClient,
      consumerService as unknown as InboxConsumerService,
      loyaltyService as unknown as LoyaltyService,
    );
  });

  async function deliver(routingKey: string, message: ConsumeMessage): Promise<void> {
    if (!rabbit.state.handler) throw new Error('the daemon never subscribed');
    await rabbit.state.handler(message);
  }

  function totalCalls(): number {
    return Object.values(loyaltyService).reduce((sum, method) => sum + method.mock.calls.length, 0);
  }

  test('subscribes only to the loyalty queue, with prefetch 1', async () => {
    await daemon.initialize();

    expect(rabbit.state.consumed).toEqual([{ queue: QUEUE, options: { prefetch: 1 } }]);
  });

  test('every subscribed event name goes to its own service method, exactly once', async () => {
    await daemon.initialize();

    for (const [eventName, method] of ROUTING) {
      const event = makeEvent(eventName);
      await deliver(eventName, makeMessage(eventName, event));

      expect(loyaltyService[method]).toHaveBeenCalledTimes(1);
      expect(loyaltyService[method]).toHaveBeenCalledWith(event);
    }

    expect(totalCalls()).toBe(ROUTING.length);
    expect(rabbit.state.acked).toHaveLength(ROUTING.length);
  });

  test('the forwarding table covers exactly the five blockchain events', async () => {
    await daemon.initialize();

    // A routing key outside the table never reaches the service.
    await deliver('Governance_VoteCast', makeMessage('Governance_VoteCast', { proposalId: '7' }));

    expect(totalCalls()).toBe(0);
    expect(rabbit.state.acked).toHaveLength(1);
  });

  test('the forwarded event keeps its envelope and decoded data', async () => {
    await daemon.initialize();

    await deliver('Pool_RwaMinted', makeMessage('Pool_RwaMinted', makeEvent('Pool_RwaMinted')));

    const forwarded = loyaltyService.processRwaMinted.mock.calls[0][0] as {
      chainId: string;
      transactionHash: string;
      blockNumber: number;
      logIndex: number;
      timestamp: number;
      data: Record<string, unknown>;
    };
    expect(forwarded.chainId).toBe('97');
    expect(forwarded.transactionHash).toBe('0x' + 'ab'.repeat(32));
    expect(forwarded.blockNumber).toBe(123_456);
    expect(forwarded.logIndex).toBe(7);
    expect(forwarded.timestamp).toBe(1_700_000_000);
    expect(forwarded.data).toEqual(EVENT_DATA.Pool_RwaMinted as Record<string, unknown>);
  });

  test('a successful delivery is acked and nothing is requeued', async () => {
    await daemon.initialize();

    await deliver(
      'Factory_CreateRWAFeeCollected',
      makeMessage('Factory_CreateRWAFeeCollected', makeEvent('Factory_CreateRWAFeeCollected')),
    );

    expect(rabbit.state.acked).toHaveLength(1);
    expect(rabbit.state.nacked).toHaveLength(0);
    expect(rabbit.state.cancelled).toEqual([]);
  });

  test('a service failure is not swallowed: the delivery is deferred to the retry queue', async () => {
    await daemon.initialize();
    consumerService.state.outcome = 'deferred';
    loyaltyService.processReferralTreasuryWithdrawn.mockRejectedValueOnce(new Error('db is down'));

    await deliver(
      'ReferralTreasury_Withdrawn',
      makeMessage('ReferralTreasury_Withdrawn', makeEvent('ReferralTreasury_Withdrawn')),
    );

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

    await deliver('Pool_RwaBurned', makeMessage('Pool_RwaBurned', {}, { raw: 'not-json{' }));

    expect(loyaltyService.processRwaBurned).toHaveBeenCalledTimes(0);
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
