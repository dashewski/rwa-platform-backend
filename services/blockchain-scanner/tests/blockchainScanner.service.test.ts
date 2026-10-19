/**
 * Unit tests for BlockchainScannerService.
 *
 * Scope: the service layer only. Repositories and the ordered publisher are
 * replaced with in-memory fakes (tests/fakes/*.fake.ts), so these tests need
 * no database, no broker and no network. Run with `bun test` from
 * services/blockchain-scanner.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { Types } from 'mongoose';
import { BlockchainScannerService } from '../src/services/blockchainScanner.service';
import type { EventRepository } from '../src/repositories/event.repository';
import type { ScannerStateRepository } from '../src/repositories/scannerState.repository';
import type { OutboxPublisherService } from '@shared/outbox-publisher';
import {
  createFakeEventRepository,
  type CreateEventInput,
  type FakeEventDoc,
  type FakeEventRepository,
} from './fakes/event.repository.fake';
import {
  createFakeScannerStateRepository,
  type FakeScannerStateRepository,
} from './fakes/scannerState.repository.fake';
import { createFakeOutboxPublisher, EXCHANGE, type FakeOutboxPublisher } from './fakes/outboxPublisher.fake';

const CHAIN_ID = 31337;
const CONTRACT_ADDRESS = '0x00000000000000000000000000000000000000aa';
const TX_HASH = `0x${'ab'.repeat(32)}`;
const STALE_TX_HASH = `0x${'ff'.repeat(32)}`;

const DEPLOYED_DATA = {
  emittedFrom: CONTRACT_ADDRESS,
  deployer: '0x00000000000000000000000000000000000000bb',
  owner: '0x00000000000000000000000000000000000000cc',
  entityId: 'business-1',
};

const STAKED_DATA = {
  emittedFrom: CONTRACT_ADDRESS,
  staker: '0x00000000000000000000000000000000000000dd',
  amount: '1000',
  newVotingPower: '42',
};

function makeEvent(overrides: Partial<CreateEventInput> = {}): CreateEventInput {
  return {
    chainId: CHAIN_ID,
    name: 'RWA_Deployed',
    blockNumber: 1000,
    transactionHash: TX_HASH,
    address: CONTRACT_ADDRESS,
    logIndex: 0,
    data: { ...DEPLOYED_DATA },
    timestamp: 1700000000,
    ...overrides,
  };
}

function seedEvent(events: FakeEventRepository, event: CreateEventInput): FakeEventDoc {
  const now = 1700000000;
  const doc: FakeEventDoc = { _id: new Types.ObjectId(), createdAt: now, updatedAt: now, ...event };
  events.store.set(doc._id.toString(), doc);
  return doc;
}

describe('BlockchainScannerService (unit, fake repositories + fake outbox publisher)', () => {
  let events: FakeEventRepository;
  let scannerState: FakeScannerStateRepository;
  let publisher: FakeOutboxPublisher;
  let service: BlockchainScannerService;

  beforeEach(() => {
    events = createFakeEventRepository();
    scannerState = createFakeScannerStateRepository();
    publisher = createFakeOutboxPublisher();
    service = new BlockchainScannerService(
      events as unknown as EventRepository,
      scannerState as unknown as ScannerStateRepository,
      publisher as unknown as OutboxPublisherService,
      EXCHANGE,
      CHAIN_ID,
    );
  });

  test('getEventById: returns the mapped event as plain JSON', async () => {
    const seeded = seedEvent(events, makeEvent());

    const event = await service.getEventById(seeded._id.toString());

    expect(events.findById).toHaveBeenCalledTimes(1);
    expect(events.findById).toHaveBeenCalledWith(seeded._id.toString());
    expect(event).toEqual({
      id: seeded._id.toString(),
      chainId: CHAIN_ID,
      blockNumber: 1000,
      transactionHash: TX_HASH,
      logIndex: 0,
      address: CONTRACT_ADDRESS,
      name: 'RWA_Deployed',
      data: DEPLOYED_DATA,
      timestamp: 1700000000,
    });
    expect(event.id).toHaveLength(24); // Mongo ObjectId hex
    expect(event).not.toHaveProperty('_id');
    // The result must be plain JSON — no ObjectId or class instances leaking to the caller.
    expect(JSON.parse(JSON.stringify(event))).toEqual(event);
  });

  test('getEventById: propagates NOT_FOUND for an unknown id', async () => {
    await expect(service.getEventById('unknown-id')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Event with id unknown-id not found',
    });
    // The repository resolves to null; the service is the layer that raises 404.
    expect(events.findById).toHaveBeenCalledWith('unknown-id');
  });

  test('getEvents: passes filters and the newest-first sort through and maps every result', async () => {
    seedEvent(events, makeEvent({ blockNumber: 1000, logIndex: 0 }));
    seedEvent(events, makeEvent({ blockNumber: 1001, logIndex: 1, transactionHash: `0x${'cd'.repeat(32)}` }));
    seedEvent(
      events,
      makeEvent({
        blockNumber: 1001,
        logIndex: 0,
        name: 'DaoStaking_TokensStaked',
        data: { ...STAKED_DATA },
        transactionHash: `0x${'ef'.repeat(32)}`,
      }),
    );

    const result = await service.getEvents({ name: 'RWA_Deployed' }, { limit: 10, offset: 0 });

    expect(events.findAll).toHaveBeenCalledTimes(1);
    expect(events.findAll).toHaveBeenCalledWith({ name: 'RWA_Deployed' }, { blockNumber: -1, logIndex: -1 }, 10, 0);
    expect(result).toHaveLength(2);
    expect(result.map((event) => event.blockNumber)).toEqual([1001, 1000]);
    expect(result.map((event) => event.transactionHash)).toEqual([`0x${'cd'.repeat(32)}`, TX_HASH]);
    for (const event of result) {
      expect(typeof event.id).toBe('string');
      expect(event).not.toHaveProperty('_id');
      expect(JSON.parse(JSON.stringify(event))).toEqual(event);
    }
  });

  test('getEvents: defaults to limit 100 / offset 0 and the newest-first sort', async () => {
    seedEvent(events, makeEvent());

    const result = await service.getEvents({});

    expect(events.findAll).toHaveBeenCalledWith({}, { blockNumber: -1, logIndex: -1 }, 100, 0);
    expect(result).toHaveLength(1);
  });

  test('getEvents: an explicit limit of 0 falls back to 100 (falsy default in the service)', async () => {
    seedEvent(events, makeEvent());

    // pagination.limit is applied through `pagination?.limit || 100`, so 0 is
    // treated as "not provided" — kept as-is here, this documents the behavior.
    await service.getEvents({}, { limit: 0, offset: 0 });

    expect(events.findAll).toHaveBeenCalledWith({}, { blockNumber: -1, logIndex: -1 }, 100, 0);
  });

  test('getEvents: returns an empty array when nothing matches', async () => {
    seedEvent(events, makeEvent());

    const result = await service.getEvents({ name: 'Pool_ReservesUpdated' });

    expect(result).toEqual([]);
  });

  test('applyBlockEvents: replaces the block events and publishes each saved event', async () => {
    // Stale copy of the same block, as left behind by an earlier scan attempt.
    const stale = seedEvent(events, makeEvent({ logIndex: 7, transactionHash: STALE_TX_HASH }));

    const blockEvents = [
      makeEvent({ blockNumber: 1000, logIndex: 0 }),
      makeEvent({
        blockNumber: 1000,
        logIndex: 1,
        name: 'DaoStaking_TokensStaked',
        data: { ...STAKED_DATA },
        transactionHash: `0x${'11'.repeat(32)}`,
      }),
    ];

    await service.applyBlockEvents(1000, blockEvents);

    // Replace-then-insert: the previous snapshot of the block is deleted first.
    expect(events.deleteBlockEvents).toHaveBeenCalledTimes(1);
    expect(events.deleteBlockEvents).toHaveBeenCalledWith(CHAIN_ID, 1000);
    expect(events.createEvents).toHaveBeenCalledTimes(1);
    expect(events.createEvents).toHaveBeenCalledWith(blockEvents);
    expect(events.store.has(stale._id.toString())).toBe(false);
    expect(events.store.size).toBe(2);

    // Queued messages: event name as routing key + a chain-stable messageId, in insert order.
    expect(publisher.publish).toHaveBeenCalledTimes(2);
    expect(publisher.queued.map((message) => message.exchange)).toEqual([EXCHANGE, EXCHANGE]);
    expect(publisher.queued.map((message) => message.routingKey)).toEqual(['RWA_Deployed', 'DaoStaking_TokensStaked']);
    expect(publisher.queued.map((message) => message.messageId)).toEqual([
      `${CHAIN_ID}:${TX_HASH}:0`,
      `${CHAIN_ID}:0x${'11'.repeat(32)}:1`,
    ]);

    const payload = publisher.queued[0].payload;
    const stored = Array.from(events.store.values()).find((doc) => doc.logIndex === 0)!;
    expect(payload._id.toString()).toBe(stored._id.toString());
    expect(payload).toMatchObject({
      chainId: CHAIN_ID,
      blockNumber: 1000,
      transactionHash: TX_HASH,
      logIndex: 0,
      address: CONTRACT_ADDRESS,
      name: 'RWA_Deployed',
      data: DEPLOYED_DATA,
      timestamp: 1700000000,
    });
    // The payload is the raw saved document, so it also carries the Mongo _id
    // and the created/updated timestamps (they are part of the queue contract).
    expect(payload).toHaveProperty('_id');
    expect(payload).toHaveProperty('createdAt');

    // The scanner state only moves once the batch was persisted and queued.
    expect(scannerState.updateLastScannedBlock).toHaveBeenCalledWith(CHAIN_ID, 1000);
    expect(await scannerState.getLastScannedBlock(CHAIN_ID)).toBe(1000);
  });

  test('applyBlockEvents: rejects a batch whose event blockNumber does not match and writes nothing', async () => {
    const blockEvents = [makeEvent({ blockNumber: 999 })];

    await expect(service.applyBlockEvents(1000, blockEvents)).rejects.toMatchObject({
      statusCode: 502,
      code: 'BLOCKCHAIN_ERROR',
      message: 'applyBlockEvents blockNumber!',
    });

    expect(events.deleteBlockEvents).toHaveBeenCalledTimes(0);
    expect(events.createEvents).toHaveBeenCalledTimes(0);
    expect(publisher.publish).toHaveBeenCalledTimes(0);
    expect(scannerState.updateLastScannedBlock).toHaveBeenCalledTimes(0);
  });

  test('applyBlockEvents: an empty batch still advances the scanner state', async () => {
    await service.applyBlockEvents(1000, []);

    expect(events.deleteBlockEvents).toHaveBeenCalledTimes(0);
    expect(events.createEvents).toHaveBeenCalledTimes(0);
    expect(publisher.publish).toHaveBeenCalledTimes(0);
    expect(scannerState.updateLastScannedBlock).toHaveBeenCalledTimes(1);
    expect(scannerState.updateLastScannedBlock).toHaveBeenCalledWith(CHAIN_ID, 1000);
  });

  test('applyBlockEvents: a queue insert failure leaves the state unadvanced so the block is processed again', async () => {
    publisher.state.failPublishFor = 'DaoStaking_TokensStaked';

    const blockEvents = [
      makeEvent({ blockNumber: 1000, logIndex: 0 }),
      makeEvent({
        blockNumber: 1000,
        logIndex: 1,
        name: 'DaoStaking_TokensStaked',
        data: { ...STAKED_DATA },
        transactionHash: `0x${'22'.repeat(32)}`,
      }),
    ];

    await expect(service.applyBlockEvents(1000, blockEvents)).rejects.toThrow(
      'publish failed for routing key DaoStaking_TokensStaked',
    );

    // The events were already persisted (delete+insert runs before queueing)
    // and the first one was already queued; the state update is skipped.
    // The next cycle re-processes the block: delete -> insert -> queue again,
    // which is the known at-least-once delivery window of this service.
    expect(events.store.size).toBe(2);
    expect(publisher.queued).toHaveLength(1);
    expect(publisher.queued[0].routingKey).toBe('RWA_Deployed');
    expect(scannerState.updateLastScannedBlock).toHaveBeenCalledTimes(0);
    expect(await scannerState.getLastScannedBlock(CHAIN_ID)).toBe(0);
  });

  test('applyBlockEvents: a re-scan of the same block queues the same chain-stable messageId', async () => {
    const blockEvents = [makeEvent({ blockNumber: 1000, logIndex: 0 })];

    await service.applyBlockEvents(1000, blockEvents);
    await service.applyBlockEvents(1000, blockEvents);

    // The block is replaced and queued again, so the outbox receives a second
    // copy — but with the same messageId: the consumer inbox makes it a no-op.
    expect(publisher.publish).toHaveBeenCalledTimes(2);
    expect(publisher.queued[0].messageId).toBe(publisher.queued[1].messageId);
    expect(publisher.queued[0].messageId).toBe(`${CHAIN_ID}:${TX_HASH}:0`);
  });

  test('getLastProcessedBlock / updateLastProcessedBlock: read and write the per-chain state', async () => {
    expect(await service.getLastProcessedBlock()).toBe(0);

    await service.updateLastProcessedBlock(1234);

    expect(scannerState.updateLastScannedBlock).toHaveBeenCalledWith(CHAIN_ID, 1234);
    expect(scannerState.getLastScannedBlock).toHaveBeenCalledWith(CHAIN_ID);
    expect(await service.getLastProcessedBlock()).toBe(1234);
  });
});
