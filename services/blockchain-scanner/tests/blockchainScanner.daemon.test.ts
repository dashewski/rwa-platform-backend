/**
 * Unit tests for BlockchainScannerDaemon.
 *
 * The daemon creates its ethers provider and EventEmitter contract in its own
 * constructor, so this harness swaps both fields for in-memory fakes right
 * after construction (see tests/fakes/ethers.fake.ts). The scanner service
 * runs for real, over fake repositories and a fake outbox publisher, so a scan
 * cycle exercises the whole chain: provider -> contract logs -> block grouping
 * -> service (persist + queue) -> scanner state. Polling is driven
 * explicitly; no RPC endpoint and no broker is ever contacted. Run with
 * `bun test` from services/blockchain-scanner.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { Types } from 'mongoose';
import { BlockchainScannerDaemon } from '../src/daemons/blockchainScanner.daemon';
import { BlockchainScannerService } from '../src/services/blockchainScanner.service';
import type { EventRepository } from '../src/repositories/event.repository';
import type { ScannerStateRepository } from '../src/repositories/scannerState.repository';
import type { OutboxPublisherService } from '@shared/outbox-publisher';
import type { RabbitMQClient } from '../src/clients/rabbitmq.client';
import { createFakeEventRepository, type FakeEventRepository } from './fakes/event.repository.fake';
import {
  createFakeScannerStateRepository,
  type FakeScannerStateRepository,
} from './fakes/scannerState.repository.fake';
import { createFakeOutboxPublisher, type FakeOutboxPublisher } from './fakes/outboxPublisher.fake';
import {
  createFakeEthersProvider,
  createFakeEventEmitterContract,
  createFakeEventLog,
  type FakeEthersProvider,
  type FakeEventEmitterContract,
  type FakeEventLog,
} from './fakes/ethers.fake';

// The daemon receives the chain id as a string (index.ts does String(process.env.CHAIN_ID)).
const CHAIN_ID = '31337';
const RPC_URL = 'http://127.0.0.1:1'; // never contacted: the provider is swapped for a fake
const CONTRACT_ADDRESS = '0x00000000000000000000000000000000000000aa';
const BLOCK_CONFIRMATIONS = 100;
const SCAN_INTERVAL_MS = 5;
const BATCH_SIZE = 50;
const GENESIS_BLOCK = 1000n;

const DEPLOYER = '0x00000000000000000000000000000000000000bb';
const OWNER = '0x00000000000000000000000000000000000000cc';
const STAKER = '0x00000000000000000000000000000000000000dd';
const HOLD_TOKEN = '0x00000000000000000000000000000000000000ee';
const RWA_TOKEN = '0x00000000000000000000000000000000000000ff';

// ABI parameter names, in declaration order, for the events used below.
const RWA_DEPLOYED_INPUTS = ['emittedFrom', 'deployer', 'owner', 'entityId'];
const TOKENS_STAKED_INPUTS = ['emittedFrom', 'staker', 'amount', 'newVotingPower'];
const RESERVES_INPUTS = ['emittedFrom', 'realHoldReserve', 'virtualHoldReserve', 'virtualRwaReserve'];
const POOL_DEPLOYED_INPUTS = [
  'emittedFrom',
  'deployer',
  'awaitCompletionExpired',
  'floatingOutTranchesTimestamps',
  'holdToken',
  'rwaToken',
  'tokenId',
  'entityId',
  'entityOwnerId',
  'entityOwnerType',
  'owner',
  'expectedHoldAmount',
  'expectedRwaAmount',
  'expectedBonusAmount',
  'rewardPercent',
  'fixedSell',
  'allowEntryBurn',
  'entryPeriodStart',
  'entryPeriodExpired',
  'completionPeriodExpired',
  'k',
  'entryFeePercent',
  'exitFeePercent',
  'outgoingTranches',
  'outgoingTranchTimestamps',
  'incomingTranches',
  'incomingTrancheExpired',
];

const POOL_DEPLOYED_ARGS: any[] = [
  CONTRACT_ADDRESS, // emittedFrom
  DEPLOYER, // deployer
  false, // awaitCompletionExpired
  false, // floatingOutTranchesTimestamps
  HOLD_TOKEN, // holdToken
  RWA_TOKEN, // rwaToken
  10n, // tokenId
  'pool-1', // entityId
  'owner-1', // entityOwnerId
  'business', // entityOwnerType
  OWNER, // owner
  1000n, // expectedHoldAmount
  2000n, // expectedRwaAmount
  300n, // expectedBonusAmount
  5n, // rewardPercent
  false, // fixedSell
  true, // allowEntryBurn
  1n, // entryPeriodStart
  2n, // entryPeriodExpired
  3n, // completionPeriodExpired
  4n, // k
  5n, // entryFeePercent
  6n, // exitFeePercent
  [100n, 200n], // outgoingTranches
  [7n], // outgoingTranchTimestamps
  [300n], // incomingTranches
  [8n], // incomingTrancheExpired
];

type DaemonInternals = {
  provider: FakeEthersProvider;
  eventEmitterContract: FakeEventEmitterContract;
  lastProcessedBlock: number;
  isRunning: boolean;
  scan: () => Promise<void>;
  getEventName: (event: FakeEventLog) => string;
  parseEventData: (event: FakeEventLog) => Record<string, any>;
};

function rwaDeployedLog(blockNumber: number, index: number, entityId: string, blockTimestamp: number): FakeEventLog {
  return createFakeEventLog({
    name: 'RWA_Deployed',
    inputs: RWA_DEPLOYED_INPUTS,
    args: [CONTRACT_ADDRESS, DEPLOYER, OWNER, entityId],
    blockNumber,
    index,
    blockTimestamp,
  });
}

function buildHarness(initScanBlockNumber: number = 0) {
  const events = createFakeEventRepository();
  const scannerState = createFakeScannerStateRepository();
  const publisher = createFakeOutboxPublisher();
  const provider = createFakeEthersProvider();
  const contract = createFakeEventEmitterContract();

  provider.state.chainId = BigInt(CHAIN_ID);

  const service = new BlockchainScannerService(
    events as unknown as EventRepository,
    scannerState as unknown as ScannerStateRepository,
    publisher as unknown as OutboxPublisherService<RabbitMQClient>,
    CHAIN_ID,
  );

  const daemon = new BlockchainScannerDaemon(
    RPC_URL,
    CONTRACT_ADDRESS,
    BLOCK_CONFIRMATIONS,
    SCAN_INTERVAL_MS,
    BATCH_SIZE,
    CHAIN_ID,
    initScanBlockNumber,
    service,
    'finalized',
  );

  // The daemon builds its ethers objects internally; swap them for the fakes
  // so that everything after construction stays in memory.
  const internals = daemon as unknown as DaemonInternals;
  internals.provider = provider;
  internals.eventEmitterContract = contract;

  return { daemon, internals, service, events, scannerState, publisher, provider, contract };
}

function seedScannerState(scannerState: FakeScannerStateRepository, lastScannedBlock: number): void {
  scannerState.store.set(CHAIN_ID, {
    _id: new Types.ObjectId(),
    chainId: CHAIN_ID,
    lastScannedBlock,
    isActive: true,
    createdAt: 0,
    updatedAt: 0,
  });
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error('waitFor: condition was not reached in time');
    await Bun.sleep(1);
  }
}

describe('BlockchainScannerDaemon (unit, fake provider/contract + fake repositories)', () => {
  let daemon: BlockchainScannerDaemon;
  let internals: DaemonInternals;
  let events: FakeEventRepository;
  let scannerState: FakeScannerStateRepository;
  let publisher: FakeOutboxPublisher;
  let provider: FakeEthersProvider;
  let contract: FakeEventEmitterContract;

  beforeEach(() => {
    ({ daemon, internals, events, scannerState, publisher, provider, contract } = buildHarness());
  });

  test('initialize: starts one block behind the genesis block when no state is stored yet', async () => {
    contract.state.genesisBlock = GENESIS_BLOCK;

    await daemon.initialize();

    expect(provider.getNetwork).toHaveBeenCalledTimes(1);
    expect(scannerState.getLastScannedBlock).toHaveBeenCalledWith(CHAIN_ID);
    expect(contract.genesisBlock).toHaveBeenCalledTimes(1);
    expect(internals.lastProcessedBlock).toBe(999);
  });

  test('initialize: resumes from the stored last scanned block without asking for genesis', async () => {
    seedScannerState(scannerState, 500);

    await daemon.initialize();

    expect(internals.lastProcessedBlock).toBe(500);
    expect(contract.genesisBlock).toHaveBeenCalledTimes(0);
  });

  test('initialize: starts from initScanBlockNumber when no state is stored yet', async () => {
    ({ daemon, internals, provider, scannerState, contract } = buildHarness(5000));

    await daemon.initialize();

    // The first scanned block is initScanBlockNumber itself, so the cursor is one behind it.
    expect(provider.getNetwork).toHaveBeenCalledTimes(1);
    expect(scannerState.getLastScannedBlock).toHaveBeenCalledWith(CHAIN_ID);
    expect(contract.genesisBlock).toHaveBeenCalledTimes(0);
    expect(internals.lastProcessedBlock).toBe(4999);
  });

  test('initialize: initScanBlockNumber does not override the stored scanner state', async () => {
    ({ daemon, internals, scannerState, contract } = buildHarness(5000));
    seedScannerState(scannerState, 500);

    await daemon.initialize();

    expect(internals.lastProcessedBlock).toBe(500);
    expect(contract.genesisBlock).toHaveBeenCalledTimes(0);
  });

  test('initialize: zero, negative or non-integer initScanBlockNumber falls back to the genesis block', async () => {
    for (const invalidValue of [0, -5, 12.5, Number.NaN]) {
      ({ daemon, internals, contract } = buildHarness(invalidValue));
      contract.state.genesisBlock = GENESIS_BLOCK;

      await daemon.initialize();

      expect(contract.genesisBlock).toHaveBeenCalledTimes(1);
      expect(internals.lastProcessedBlock).toBe(Number(GENESIS_BLOCK) - 1);
    }
  });

  test('initialize: a provider chain id mismatch is wrapped into BLOCKCHAIN_ERROR', async () => {
    provider.state.chainId = BigInt(Number(CHAIN_ID) + 1);

    const error: any = await daemon.initialize().catch((thrown) => thrown);

    expect(error).toMatchObject({
      message: 'Failed to initialize Blockchain Scanner Daemon',
      statusCode: 502,
      code: 'BLOCKCHAIN_ERROR',
    });
    expect(error.cause.message).toBe(
      `Chain ID mismatch. Expected ${CHAIN_ID}, but provider returned ${Number(CHAIN_ID) + 1}`,
    );
    // The mismatch is detected before any state is read.
    expect(scannerState.getLastScannedBlock).toHaveBeenCalledTimes(0);
  });

  test('initialize: a failing genesisBlock call is wrapped into BLOCKCHAIN_ERROR', async () => {
    contract.state.genesisBlockError = new Error('call revert exception');

    const error: any = await daemon.initialize().catch((thrown) => thrown);

    expect(error).toMatchObject({
      message: 'Failed to initialize Blockchain Scanner Daemon',
      statusCode: 502,
      code: 'BLOCKCHAIN_ERROR',
    });
    expect(error.cause.message).toBe('Failed to get genesis block');
  });

  test('parseEventData: maps ABI parameter names and converts bigint values to strings', () => {
    const log = createFakeEventLog({
      name: 'DaoStaking_TokensStaked',
      inputs: TOKENS_STAKED_INPUTS,
      args: [CONTRACT_ADDRESS, STAKER, 1000n, 42n],
      blockNumber: 1000,
      index: 0,
    });

    expect(internals.parseEventData(log)).toEqual({
      emittedFrom: CONTRACT_ADDRESS,
      staker: STAKER,
      amount: '1000',
      newVotingPower: '42',
    });
  });

  test('parseEventData: converts the uint256 arrays of Pool_Deployed into arrays of strings', () => {
    expect(POOL_DEPLOYED_ARGS).toHaveLength(POOL_DEPLOYED_INPUTS.length);

    const log = createFakeEventLog({
      name: 'Pool_Deployed',
      inputs: POOL_DEPLOYED_INPUTS,
      args: POOL_DEPLOYED_ARGS,
      blockNumber: 1000,
      index: 0,
    });

    const data = internals.parseEventData(log);

    expect(Object.keys(data)).toHaveLength(POOL_DEPLOYED_INPUTS.length);
    expect(data.tokenId).toBe('10');
    expect(data.entityId).toBe('pool-1');
    expect(data.fixedSell).toBe(false);
    expect(data.allowEntryBurn).toBe(true);
    expect(data.outgoingTranches).toEqual(['100', '200']);
    expect(data.outgoingTranchTimestamps).toEqual(['7']);
    expect(data.incomingTranches).toEqual(['300']);
    expect(data.incomingTrancheExpired).toEqual(['8']);
  });

  test('getEventName: falls back to Unknown when the log carries no fragment', () => {
    const log = createFakeEventLog({
      name: 'RWA_Deployed',
      inputs: RWA_DEPLOYED_INPUTS,
      args: undefined,
      blockNumber: 1000,
      index: 0,
      withFragment: false,
    });

    expect(internals.getEventName(log)).toBe('Unknown');
    // Without decoded args there is nothing to map; parseEventData yields {}.
    expect(internals.parseEventData(log)).toEqual({});
  });

  test('scan: does nothing while the confirmed block is not ahead of the stored one', async () => {
    internals.lastProcessedBlock = 1400;
    provider.state.blockNumber = 1500; // confirmed = 1500 - 100 = 1400

    await internals.scan();

    expect(provider.getBlock).toHaveBeenCalledTimes(1);
    expect(contract.queryFilter).toHaveBeenCalledTimes(0);
    expect(scannerState.updateLastScannedBlock).toHaveBeenCalledTimes(0);
    expect(internals.lastProcessedBlock).toBe(1400);
  });

  test('scan: walks one batch forward even when the range has no events', async () => {
    internals.lastProcessedBlock = 999;
    provider.state.blockNumber = 1500; // confirmed = 1400

    await internals.scan();

    expect(contract.queryFilter).toHaveBeenCalledTimes(1);
    expect(contract.queryFilter).toHaveBeenCalledWith('*', 1000, 1049); // batchSize 50, capped by the confirmed block
    expect(events.createEvents).toHaveBeenCalledTimes(0);
    expect(publisher.publish).toHaveBeenCalledTimes(0);
    expect(internals.lastProcessedBlock).toBe(1049);
    expect(scannerState.updateLastScannedBlock).toHaveBeenCalledWith(CHAIN_ID, 1049);
    expect(await scannerState.getLastScannedBlock(CHAIN_ID)).toBe(1049);
  });

  test('scan: the batch never crosses the confirmed block', async () => {
    internals.lastProcessedBlock = 1040;
    provider.state.blockNumber = 1100; // confirmed = 1100 - 100 = 1000

    await internals.scan();

    // confirmed = 1000 <= lastProcessedBlock = 1040: caught up, nothing to scan.
    expect(contract.queryFilter).toHaveBeenCalledTimes(0);

    internals.lastProcessedBlock = 990;
    await internals.scan();

    // from = 991, to = min(991 + 50 - 1, 1000) = 1000: clamped to the confirmations boundary.
    expect(contract.queryFilter).toHaveBeenCalledWith('*', 991, 1000);
    expect(internals.lastProcessedBlock).toBe(1000);
  });

  test('scan: groups events per block in ascending order and publishes the mapped payloads', async () => {
    internals.lastProcessedBlock = 999;
    provider.state.blockNumber = 1500; // confirmed = 1400, batch = 1000..1049

    contract.state.events = [
      createFakeEventLog({
        name: 'DaoStaking_TokensStaked',
        inputs: TOKENS_STAKED_INPUTS,
        args: [CONTRACT_ADDRESS, STAKER, 250n, 5n],
        blockNumber: 1001,
        index: 5,
        blockTimestamp: 111,
      }),
      rwaDeployedLog(1000, 0, 'business-1', 100),
      createFakeEventLog({
        name: 'Pool_ReservesUpdated',
        inputs: RESERVES_INPUTS,
        args: [CONTRACT_ADDRESS, 1n, 2n, 3n],
        blockNumber: 1001,
        index: 6,
        blockTimestamp: 222,
      }),
    ];

    await internals.scan();

    // One delete + one insert per block that has events, in ascending block order.
    expect(events.deleteBlockEvents.mock.calls.map((call) => call[1])).toEqual([1000, 1001]);
    expect(events.createEvents).toHaveBeenCalledTimes(2);
    expect(events.store.size).toBe(3);
    for (const doc of events.store.values()) {
      expect(doc.chainId).toBe(CHAIN_ID);
      expect(doc.address).toBe(CONTRACT_ADDRESS);
    }

    expect(publisher.queued.map((message) => message.routingKey)).toEqual([
      'RWA_Deployed',
      'DaoStaking_TokensStaked',
      'Pool_ReservesUpdated',
    ]);

    const [first, second, third] = publisher.queued.map((message) => message.payload);
    expect(first).toMatchObject({
      chainId: CHAIN_ID,
      name: 'RWA_Deployed',
      blockNumber: 1000,
      logIndex: 0,
      address: CONTRACT_ADDRESS,
      timestamp: 100,
      data: { entityId: 'business-1' },
    });
    expect(second).toMatchObject({
      name: 'DaoStaking_TokensStaked',
      blockNumber: 1001,
      logIndex: 5,
      timestamp: 111,
      data: { amount: '250', newVotingPower: '5' },
    });
    // Both events of block 1001 carry the block timestamp, taken from the first
    // log of the group (111), not from their own getBlock() call (222).
    expect(third).toMatchObject({
      name: 'Pool_ReservesUpdated',
      blockNumber: 1001,
      logIndex: 6,
      timestamp: 111,
      data: { realHoldReserve: '1', virtualHoldReserve: '2', virtualRwaReserve: '3' },
    });

    // Per-block state updates, then one batch-level update up to the batch end.
    expect(scannerState.updateLastScannedBlock.mock.calls.map((call) => call[1])).toEqual([1000, 1001, 1049]);
    expect(internals.lastProcessedBlock).toBe(1049);
  });

  test('scan: a failing getBlock is swallowed and the cycle is retried later', async () => {
    internals.lastProcessedBlock = 999;
    provider.state.getBlockError = new Error('connect ECONNREFUSED 127.0.0.1:1');

    await expect(internals.scan()).resolves.toBeUndefined();

    expect(contract.queryFilter).toHaveBeenCalledTimes(0);
    expect(scannerState.updateLastScannedBlock).toHaveBeenCalledTimes(0);
    expect(internals.lastProcessedBlock).toBe(999);
  });

  test('scan: a queryFilter failure is wrapped into BLOCKCHAIN_ERROR and the state stays put', async () => {
    internals.lastProcessedBlock = 999;
    provider.state.blockNumber = 1500;
    contract.state.queryFilterError = new Error('block range too large');

    const error: any = await internals.scan().catch((thrown) => thrown);

    expect(error).toMatchObject({
      message: 'Error during blockchain scan',
      statusCode: 502,
      code: 'BLOCKCHAIN_ERROR',
    });
    expect(error.cause.message).toBe('Failed to get events from block 1000 to 1049');
    expect(scannerState.updateLastScannedBlock).toHaveBeenCalledTimes(0);
    expect(internals.lastProcessedBlock).toBe(999);
  });

  test('scan: a log that cannot be parsed fails the cycle and the block stays unprocessed', async () => {
    internals.lastProcessedBlock = 999;
    provider.state.blockNumber = 1500;
    contract.state.events = [
      // Fragment missing while args are present: parseEventData cannot map the
      // parameters by name and raises.
      createFakeEventLog({
        name: 'RWA_Deployed',
        inputs: RWA_DEPLOYED_INPUTS,
        args: [CONTRACT_ADDRESS],
        blockNumber: 1000,
        index: 0,
        withFragment: false,
      }),
    ];

    const error: any = await internals.scan().catch((thrown) => thrown);

    expect(error).toMatchObject({
      message: 'Error during blockchain scan',
      statusCode: 502,
      code: 'BLOCKCHAIN_ERROR',
    });
    expect(error.cause.message).toBe('Failed to get events from block 1000 to 1049');
    expect(error.cause.cause.message).toBe('Failed to parse event data');
    expect(events.deleteBlockEvents).toHaveBeenCalledTimes(0);
    expect(internals.lastProcessedBlock).toBe(999);
  });

  test('start: runs scan cycles until stop(), publishes events and is idempotent on stop', async () => {
    // Capture this test's harness locally. The module-level bindings above are
    // reassigned by beforeEach, and under `bun test --concurrent` the runner
    // starts the next test before this one settles — the neighbouring test
    // rebuilds the module state mid-flight, so rely only on these locals.
    const testDaemon = daemon;
    const testInternals = internals;
    const testState = scannerState;
    const testProvider = provider;
    const testContract = contract;
    const testPublisher = publisher;
    const testEvents = events;

    testInternals.lastProcessedBlock = 999;
    testProvider.state.blockNumber = 1500;
    testContract.state.events = [rwaDeployedLog(1000, 0, 'business-1', 100)];

    await testDaemon.start();
    expect(testInternals.isRunning).toBe(true);

    try {
      // First cycle writes two state rows: the per-block update (1000) and the
      // batch-level update (1049).
      await waitFor(() => testState.updateLastScannedBlock.mock.calls.length >= 2);

      // The first cycle processed block 1000 and advanced the batch pointer.
      expect(testState.updateLastScannedBlock.mock.calls).toContainEqual([CHAIN_ID, 1000]);
      expect(testState.updateLastScannedBlock.mock.calls).toContainEqual([CHAIN_ID, 1049]);
      expect(testInternals.lastProcessedBlock).toBeGreaterThanOrEqual(1049);
      expect(testEvents.store.size).toBe(1);
      expect(testPublisher.publish).toHaveBeenCalledTimes(1);
      expect(testPublisher.queued[0].routingKey).toBe('RWA_Deployed');
      expect(testPublisher.queued[0].payload).toMatchObject({ blockNumber: 1000, data: { entityId: 'business-1' } });
    } finally {
      await testDaemon.stop();
    }

    expect(testInternals.isRunning).toBe(false);

    // stop() is idempotent on a stopped daemon.
    await testDaemon.stop();
    expect(testInternals.isRunning).toBe(false);

    // Let the loop drain its sleeping timer, then confirm nothing else was queued.
    const queuedAfterStop = testPublisher.queued.length;
    await Bun.sleep(SCAN_INTERVAL_MS * 4);
    expect(testPublisher.queued.length).toBe(queuedAfterStop);
  });

  test('stop: is a no-op when the daemon was never started', async () => {
    await daemon.stop();

    expect(internals.isRunning).toBe(false);
    expect(provider.getBlock).toHaveBeenCalledTimes(0);
  });
});
