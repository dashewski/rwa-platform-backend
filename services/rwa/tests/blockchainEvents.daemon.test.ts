/**
 * Unit tests for BlockchainEventsDaemon.
 *
 * Scope: routing only — which event name goes to which BusinessService /
 * PoolService method. The RabbitMQ machinery and the delivery pipeline live in
 * @shared/ordered-consumer (covered by the package's own tests); both services
 * are replaced with in-memory fakes (tests/fakes/*.fake.ts), so these tests
 * need no broker and no database. Run with `bun test` from services/rwa.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { AppError } from '@shared/errors/app-errors';
import {
  BlockchainEventsDaemon,
  BLOCKCHAIN_EVENTS_EXCHANGE,
  BLOCKCHAIN_EVENTS_QUEUE,
} from '../src/daemons/blockchainEvents.daemon';
import type { BlockchainEvent } from '@shared/blockchain';
import type { BusinessService } from '../src/services/business.service';
import type { PoolService } from '../src/services/pool.service';
import { createFakeBusinessService, type FakeBusinessService } from './fakes/business.service.fake';
import { createFakePoolService, type FakePoolService } from './fakes/pool.service.fake';

const BUSINESS_EVENT = 'RWA_Deployed';
const BUSINESS_PAUSED_EVENT = 'RWA_PausedStateChanged';

// Every pool event the daemon routes, and the PoolService method it must call.
const POOL_EVENT_ROUTING: Array<[string, keyof FakePoolService]> = [
  ['Pool_Deployed', 'syncPoolAfterDeployment'],
  ['Pool_BonusWithdrawn', 'syncPoolBonusWithdrawn'],
  ['Pool_AwaitingRwaAmountUpdated', 'syncPoolAwaitingRwaAmount'],
  ['Pool_FundsFullyReturned', 'syncPoolFundsFullyReturned'],
  ['Pool_IncomingReturnSummary', 'syncPoolIncomingReturnSummary'],
  ['Pool_IncomingTrancheUpdate', 'syncPoolIncomingTrancheUpdate'],
  ['Pool_OutgoingClaimSummary', 'syncPoolOutgoingClaimSummary'],
  ['Pool_OutgoingTrancheClaimed', 'syncPoolOutgoingTrancheClaimed'],
  ['Pool_PausedStateChanged', 'syncPoolPausedState'],
  ['Pool_ReservesUpdated', 'syncPoolReserves'],
  ['Pool_TargetReached', 'syncPoolTargetReached'],
];

function blockchainEvent(name: string, data: Record<string, unknown>): BlockchainEvent {
  return {
    chainId: 97,
    name,
    blockNumber: 123,
    transactionHash: `0x${'ab'.repeat(32)}`,
    address: '0x00000000000000000000000000000000000000aa',
    logIndex: 0,
    data,
    timestamp: 1717171717,
  };
}

describe('BlockchainEventsDaemon (unit, fake services)', () => {
  let businessService: FakeBusinessService;
  let poolService: FakePoolService;
  let daemon: BlockchainEventsDaemon;

  beforeEach(() => {
    businessService = createFakeBusinessService();
    poolService = createFakePoolService();
    // the base machinery (rabbit client, consumer service) is never touched here
    daemon = new BlockchainEventsDaemon(
      {} as any,
      {} as any,
      businessService as unknown as BusinessService,
      poolService as unknown as PoolService,
    );
  });

  test('the daemon declares the blockchain events exchange and the rwa queue', () => {
    expect(BLOCKCHAIN_EVENTS_EXCHANGE).toBe('blockchain.events');
    expect(BLOCKCHAIN_EVENTS_QUEUE).toBe('blockchain.events.rwa');
  });

  test('getEventRouting: exposes exactly the expected event handlers', () => {
    const routing = daemon.getEventRouting();

    const expectedEvents = [
      BUSINESS_EVENT,
      BUSINESS_PAUSED_EVENT,
      ...POOL_EVENT_ROUTING.map(([eventName]) => eventName),
    ];
    expect(Object.keys(routing).sort()).toEqual(expectedEvents.sort());
  });

  test('getEventRouting: has no handler for unknown events', () => {
    const routing = daemon.getEventRouting() as Record<string, unknown>;

    expect(routing['Pool_Unknown']).toBeUndefined();
  });

  test('RWA_Deployed: routes to businessService.syncAfterDeployment with event.data', async () => {
    const event = blockchainEvent(BUSINESS_EVENT, { entityId: 'business-1', emittedFrom: '0xtoken', owner: '0xowner' });

    await daemon.getEventRouting()[BUSINESS_EVENT](event);

    expect(businessService.syncAfterDeployment).toHaveBeenCalledTimes(1);
    expect(businessService.syncAfterDeployment).toHaveBeenCalledWith(event.data, {
      sourceId: `${event.chainId}:${event.transactionHash}:${event.logIndex}`,
    });
    expect(businessService.syncAfterDeployment.mock.calls[0][0]).toBe(event.data); // same reference, no re-mapping
    expect(poolService.syncPoolAfterDeployment).toHaveBeenCalledTimes(0);
  });

  test('RWA_PausedStateChanged: routes to businessService.syncPausedState with event.data', async () => {
    const event = blockchainEvent(BUSINESS_PAUSED_EVENT, { emittedFrom: '0xtoken', isPaused: true });

    await daemon.getEventRouting()[BUSINESS_PAUSED_EVENT](event);

    expect(businessService.syncPausedState).toHaveBeenCalledTimes(1);
    expect(businessService.syncPausedState).toHaveBeenCalledWith(event.data);
    expect(businessService.syncPausedState.mock.calls[0][0]).toBe(event.data); // same reference, no re-mapping
    expect(poolService.syncPoolPausedState).toHaveBeenCalledTimes(0);
  });

  for (const [eventName, method] of POOL_EVENT_ROUTING) {
    test(`${eventName}: routes to poolService.${method} with event.data`, async () => {
      const event = blockchainEvent(eventName, { entityId: 'pool-1', emittedFrom: '0xpool' });

      await daemon.getEventRouting()[eventName](event);

      expect(poolService[method]).toHaveBeenCalledTimes(1);
      if (eventName === 'Pool_Deployed') {
        // The deployment event also carries the stable source id used to make
        // webhook deliveries deduplicable across scanner replays.
        expect(poolService[method]).toHaveBeenCalledWith(event.data, {
          sourceId: `${event.chainId}:${event.transactionHash}:${event.logIndex}`,
        });
      } else {
        expect(poolService[method]).toHaveBeenCalledWith(event.data);
      }
      expect(poolService[method].mock.calls[0][0]).toBe(event.data); // same reference, no re-mapping
    });
  }

  test('routing handlers propagate service errors', async () => {
    const serviceError = new AppError({ message: 'Database unavailable', statusCode: 503, code: 'SERVICE_UNAVAILABLE' });
    poolService.syncPoolReserves.mockImplementationOnce(async () => {
      throw serviceError;
    });
    const event = blockchainEvent('Pool_ReservesUpdated', { emittedFrom: '0xpool' });

    await expect(daemon.getEventRouting()['Pool_ReservesUpdated'](event)).rejects.toBe(serviceError);
  });
});
