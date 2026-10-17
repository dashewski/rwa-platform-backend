/**
 * Unit tests for BlockchainEventsDaemon.
 *
 * Scope: routing only — which event name goes to which LoyaltyService method.
 * The RabbitMQ machinery and the delivery pipeline live in
 * @shared/ordered-consumer (covered by the package's own tests); here the
 * LoyaltyService is replaced with an in-memory fake, so these tests need no
 * broker and no database.
 * Run with `bun test` from services/loyalty.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  BlockchainEventsDaemon,
  BLOCKCHAIN_EVENTS_EXCHANGE,
  BLOCKCHAIN_EVENTS_QUEUE,
} from '../src/daemons/blockchainEvents.daemon';
import type { BlockchainEvent } from '@shared/blockchain';
import type { LoyaltyService } from '../src/services/loyalty.service';

const ROUTING: Array<[string, keyof ReturnType<typeof createFakeLoyaltyService>]> = [
  ['Factory_CreateRWAFeeCollected', 'processCreateRWAFeeCollected'],
  ['Factory_CreatePoolFeeCollected', 'processCreatePoolFeeCollected'],
  ['Pool_RwaMinted', 'processRwaMinted'],
  ['Pool_RwaBurned', 'processRwaBurned'],
  ['ReferralTreasury_Withdrawn', 'processReferralTreasuryWithdrawn'],
];

function createFakeLoyaltyService() {
  return {
    processCreateRWAFeeCollected: mock(async (_event: unknown): Promise<void> => {}),
    processCreatePoolFeeCollected: mock(async (_event: unknown): Promise<void> => {}),
    processRwaMinted: mock(async (_event: unknown): Promise<void> => {}),
    processRwaBurned: mock(async (_event: unknown): Promise<void> => {}),
    processReferralTreasuryWithdrawn: mock(async (_event: unknown): Promise<void> => {}),
  };
}

type FakeLoyaltyService = ReturnType<typeof createFakeLoyaltyService>;

const EVENT: BlockchainEvent = {
  chainId: 97,
  name: 'Pool_RwaMinted',
  blockNumber: 123456,
  transactionHash: '0x' + 'ab'.repeat(32),
  address: '0x' + '44'.repeat(20),
  logIndex: 7,
  data: {
    sender: '0x' + '11'.repeat(20),
    minter: '0x' + '11'.repeat(20),
    token: '0x' + '22'.repeat(20),
    amount: '1000',
    feePaid: '1000',
  },
  timestamp: 1730000000,
};

function totalServiceCalls(loyaltyService: FakeLoyaltyService): number {
  return Object.values(loyaltyService).reduce((sum, method) => sum + method.mock.calls.length, 0);
}

describe('BlockchainEventsDaemon (unit, fake service)', () => {
  let loyaltyService: FakeLoyaltyService;
  let daemon: BlockchainEventsDaemon;

  beforeEach(() => {
    loyaltyService = createFakeLoyaltyService();
    // the base machinery (rabbit client, consumer service) is never touched here
    daemon = new BlockchainEventsDaemon({} as any, {} as any, loyaltyService as unknown as LoyaltyService);
  });

  test('the daemon declares the blockchain events exchange and the loyalty queue', () => {
    expect(BLOCKCHAIN_EVENTS_EXCHANGE).toBe('blockchain.events');
    expect(BLOCKCHAIN_EVENTS_QUEUE).toBe('blockchain.events.loyalty');
  });

  test('routing: the loyalty queue binds exactly these events', () => {
    expect(Object.keys(daemon.getEventRouting())).toEqual(ROUTING.map(([eventName]) => eventName));
  });

  test('routing: dispatches every event name to its LoyaltyService method and nothing else', async () => {
    const routing = daemon.getEventRouting();

    for (const [name, method] of ROUTING) {
      await routing[name]({ ...EVENT, name });

      expect(loyaltyService[method]).toHaveBeenCalledTimes(1);
      expect(loyaltyService[method]).toHaveBeenCalledWith({ ...EVENT, name });
    }

    // exactly one service call per delivered message — no double dispatch
    expect(totalServiceCalls(loyaltyService)).toBe(ROUTING.length);
  });

  test('routing: forwards the envelope and the decoded data untouched', async () => {
    await daemon.getEventRouting()[EVENT.name](EVENT);

    const forwarded = loyaltyService.processRwaMinted.mock.calls[0][0];
    expect(forwarded).toEqual(EVENT);
    expect((forwarded as BlockchainEvent).data).toEqual(EVENT.data);
  });

  test('routing: a service failure propagates to the retry loop', async () => {
    loyaltyService.processReferralTreasuryWithdrawn.mockRejectedValueOnce(new Error('db is down'));

    await expect(
      daemon.getEventRouting()['ReferralTreasury_Withdrawn']({ ...EVENT, name: 'ReferralTreasury_Withdrawn' }),
    ).rejects.toThrow('db is down');
  });
});
