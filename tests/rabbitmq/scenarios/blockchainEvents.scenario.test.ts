/**
 * Scenario: blockchain-scanner → `blockchain.events` → all five listeners.
 *
 * This is the whole protocol of the blockchain fan-out, not a single unit:
 *   scanner applies a block → writes events to Mongo → queues one outbox row per
 *   event → the outbox publishes to `blockchain.events` → the broker copies the
 *   event into every queue bound to that routing key → five inbox daemons
 *   deduplicate by `chainId:txHash:logIndex` and call their services once.
 *
 * Real: scanner service, repositories, inbox daemons, inbox/outbox services,
 * broker, Mongo. Stubbed: the five business services (call recorders) — their
 * behaviour is covered by their own unit tests; here only routing matters.
 *
 * Run:
 *   bun --env-file=infrastructure/docker/.env test --timeout=180000 \
 *     tests/rabbitmq/scenarios/blockchainEvents.scenario.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { connect } from 'amqplib';
import type { ChannelModel, ConfirmChannel } from 'amqplib';
import {
  RABBIT_URI,
  ScopedClient,
  connectMongo,
  createInboxService,
  deleteScopedTopology,
  inboxModel,
  dropMongo,
  recorder,
  scenarioPrefix,
  waitFor,
  type Recorder,
} from './harness';
import mongoose from 'mongoose';
import { OutboxPublisherService } from '@shared/outbox-publisher/src/services/outboxPublisher.service';
import { OutboxPublisherMessageRepository } from '@shared/outbox-publisher/src/repositories/outboxPublisherMessage.repository';
import { OutboxPublisherMessageEntity } from '@shared/outbox-publisher/src/models/entity/outboxPublisherMessage.entity';
import { BlockchainScannerService } from '../../../services/blockchain-scanner/src/services/blockchainScanner.service';
import { EventRepository } from '../../../services/blockchain-scanner/src/repositories/event.repository';
import { ScannerStateRepository } from '../../../services/blockchain-scanner/src/repositories/scannerState.repository';
import { EventEntity } from '../../../services/blockchain-scanner/src/models/entity/event.entity';
import { ScannerStateEntity } from '../../../services/blockchain-scanner/src/models/entity/scannerState.entity';
import { RabbitMQClient as ScannerClient } from '../../../services/blockchain-scanner/src/clients/rabbitmq.client';
import { RabbitMQClient as RwaClient } from '../../../services/rwa/src/clients/rabbitmq.client';
import { RabbitMQClient as ChartsClient } from '../../../services/charts/src/clients/rabbitmq.client';
import { RabbitMQClient as DaoClient } from '../../../services/dao/src/clients/rabbitmq.client';
import { RabbitMQClient as LoyaltyClient } from '../../../services/loyalty/src/clients/rabbitmq.client';
import { RabbitMQClient as PortfolioClient } from '../../../services/portfolio/src/clients/rabbitmq.client';
import { InboxConsumerDaemon as RwaInbox } from '../../../services/rwa/src/daemons/inboxConsumer.daemon';
import { InboxConsumerDaemon as ChartsInbox } from '../../../services/charts/src/daemons/inboxConsumer.daemon';
import { InboxConsumerDaemon as DaoInbox } from '../../../services/dao/src/daemons/inboxConsumer.daemon';
import { InboxConsumerDaemon as LoyaltyInbox } from '../../../services/loyalty/src/daemons/inboxConsumer.daemon';
import { InboxConsumerDaemon as PortfolioInbox } from '../../../services/portfolio/src/daemons/inboxConsumer.daemon';

const PREFIX = scenarioPrefix('chain-events');
const CHAIN_ID = '31337';
const EXCHANGE = 'blockchain.events';

type Event = {
  chainId: string;
  name: string;
  blockNumber: number;
  transactionHash: string;
  address: string;
  logIndex: number;
  data: Record<string, any>;
  timestamp: number;
};

function event(name: string, blockNumber: number, logIndex: number, transactionHash = `0xtx-${blockNumber}`): Event {
  return {
    chainId: CHAIN_ID,
    name,
    blockNumber,
    transactionHash,
    address: '0xEventEmitter',
    logIndex,
    data: { emittedFrom: '0xPool', poolId: 'pool-1', amount: '1000' },
    timestamp: 1_700_000_000 + blockNumber,
  };
}

describe('scenario: scanner → blockchain.events → listeners', () => {
  const prefix = PREFIX;

  /** Production topology of every participant; the harness clones it under the prefix. */
  const topologies = {
    scanner: new ScannerClient('amqp://placeholder').getTopologyDefinition(),
    rwa: new RwaClient('amqp://placeholder').getTopologyDefinition(),
    charts: new ChartsClient('amqp://placeholder').getTopologyDefinition(),
    dao: new DaoClient('amqp://placeholder').getTopologyDefinition(),
    loyalty: new LoyaltyClient('amqp://placeholder').getTopologyDefinition(),
    portfolio: new PortfolioClient('amqp://placeholder').getTopologyDefinition(),
  };

  const scannerClient = new ScopedClient('blockchain-scanner', prefix, topologies.scanner);
  const rwaClient = new ScopedClient('rwa', prefix, topologies.rwa);
  const chartsClient = new ScopedClient('charts', prefix, topologies.charts);
  const daoClient = new ScopedClient('dao', prefix, topologies.dao);
  const loyaltyClient = new ScopedClient('loyalty', prefix, topologies.loyalty);
  const portfolioClient = new ScopedClient('portfolio', prefix, topologies.portfolio);

  const businessService: Recorder = recorder();
  const poolService: Recorder = recorder();
  const chartsService: Recorder = recorder();
  const transactionsService: Recorder = recorder();
  const daoService: Recorder = recorder();
  const loyaltyService: Recorder = recorder();
  const portfolioService: Recorder = recorder();

  const daemons: Array<{ initialize(): Promise<void>; stop(): Promise<void> }> = [];
  let raw: { connection: ChannelModel; channel: ConfirmChannel };
  let scanner: BlockchainScannerService;
  let outbox: OutboxPublisherService;

  beforeAll(async () => {
    await connectMongo('rwa_scn_chain');
    // createIndexes, not init(): the scenarios reconnect to their own databases and
    // mongoose caches init() results across files, which would skip the unique markers
    await OutboxPublisherMessageEntity.createIndexes();
    await EventEntity.createIndexes();
    await ScannerStateEntity.createIndexes();

    const connection = await connect(RABBIT_URI, { heartbeat: 5 });
    connection.on('error', () => undefined);
    const channel = await connection.createConfirmChannel();
    channel.on('error', () => undefined);
    raw = { connection, channel };

    for (const client of [scannerClient, rwaClient, chartsClient, daoClient, loyaltyClient, portfolioClient]) {
      await client.initialize();
    }

    // every consumer keeps its own marker store, as separate service databases do in production
    daemons.push(
      new RwaInbox(rwaClient as never, createInboxService('rwa'), businessService as never, poolService as never),
      new ChartsInbox(
        chartsClient as never,
        createInboxService('charts'),
        chartsService as never,
        transactionsService as never,
      ),
      new DaoInbox(daoClient as never, createInboxService('dao'), daoService as never),
      new LoyaltyInbox(loyaltyClient as never, createInboxService('loyalty'), loyaltyService as never),
      new PortfolioInbox(portfolioClient as never, createInboxService('portfolio'), portfolioService as never),
    );

    for (const consumer of ['rwa', 'charts', 'dao', 'loyalty', 'portfolio']) {
      await inboxModel(consumer).createIndexes();
    }

    for (const daemon of daemons) await daemon.initialize();

    outbox = new OutboxPublisherService(scannerClient, new OutboxPublisherMessageRepository());
    scanner = new BlockchainScannerService(
      new EventRepository(),
      new ScannerStateRepository(),
      outbox,
      EXCHANGE,
      CHAIN_ID,
    );
  });

  afterAll(async () => {
    for (const daemon of daemons) await daemon.stop();

    for (const topology of Object.values(topologies)) {
      await deleteScopedTopology(prefix, topology, raw.channel);
    }

    await raw.connection.close().catch(() => undefined);

    for (const client of [scannerClient, rwaClient, chartsClient, daoClient, loyaltyClient, portfolioClient]) {
      await client.disconnect();
    }

    await dropMongo();
  });

  test('one block reaches every listener exactly once, each on its own queue', async () => {
    const block = 100;
    const events = [
      event('Pool_ReservesUpdated', block, 0),
      event('Pool_RwaMinted', block, 1),
      event('Governance_VoteCast', block, 2),
      event('RWA_Transfer', block, 3),
    ];

    await scanner.applyBlockEvents(block, events);
    await outbox.processOutbox(EXCHANGE, true, 1, Number.POSITIVE_INFINITY);

    await waitFor(
      () =>
        poolService.callsOf('syncPoolReserves').length === 1 &&
        chartsService.callsOf('recordPriceData').length === 1 &&
        transactionsService.callsOf('recordMint').length === 1 &&
        loyaltyService.callsOf('processRwaMinted').length === 1 &&
        daoService.callsOf('processVoteCast').length === 1 &&
        portfolioService.callsOf('processTransfer').length === 1,
      30_000,
    );

    // the scanner stored the block and advanced its state
    expect(await EventEntity.countDocuments({ chainId: CHAIN_ID, blockNumber: block })).toBe(4);
    expect(await new ScannerStateRepository().getLastScannedBlock(CHAIN_ID)).toBe(block);

    // every queue is drained: each event was applied, not left half-delivered
    for (const queue of [
      'blockchain.events.rwa',
      'blockchain.events.charts',
      'blockchain.events.dao',
      'blockchain.events.loyalty',
      'blockchain.events.portfolio',
    ]) {
      expect((await raw.channel.checkQueue(scannerClient.queueName(queue))).messageCount).toBe(0);
    }
  }, 60_000);

  test('a re-scanned block is a no-op: the outbox dedups the messageId and the inbox dedups the delivery', async () => {
    const block = 100;
    const events = [
      event('Pool_ReservesUpdated', block, 0),
      event('Pool_RwaMinted', block, 1),
      event('Governance_VoteCast', block, 2),
      event('RWA_Transfer', block, 3),
    ];

    await scanner.applyBlockEvents(block, events);
    await outbox.processOutbox(EXCHANGE, true, 1, Number.POSITIVE_INFINITY);
    await Bun.sleep(300);

    expect(poolService.callsOf('syncPoolReserves')).toHaveLength(1);
    expect(daoService.callsOf('processVoteCast')).toHaveLength(1);
    expect(portfolioService.callsOf('processTransfer')).toHaveLength(1);

    // one outbox row per (chain, tx, logIndex) — a rescan never queues a second copy
    expect(await OutboxPublisherMessageEntity.countDocuments({ exchange: EXCHANGE })).toBe(4);
  }, 60_000);

  test('an event with no bound queue lands in the quarantine and the stream keeps going', async () => {
    const block = 101;
    const unbound = event('ReferralTreasury_EmergencyWithdrawn', block, 0);
    const behindIt = event('Pool_TargetReached', block, 1);

    await scanner.applyBlockEvents(block, [unbound, behindIt]);
    await outbox.processOutbox(EXCHANGE, true, 1, Number.POSITIVE_INFINITY);

    const unboundRow = await OutboxPublisherMessageEntity.findOne({
      exchange: EXCHANGE,
      messageId: `${CHAIN_ID}:${unbound.transactionHash}:0`,
    }).lean();
    const behindRow = await OutboxPublisherMessageEntity.findOne({
      exchange: EXCHANGE,
      messageId: `${CHAIN_ID}:${behindIt.transactionHash}:1`,
    }).lean();

    // alternate-exchange keeps the unroutable event from bouncing back: both rows are sent
    expect(unboundRow?.status).toBe('sent');
    expect(behindRow?.status).toBe('sent');

    // the unbound event waits in the quarantine queue nobody consumes yet
    const quarantine = await raw.channel.checkQueue(scannerClient.queueName('blockchain.events.unrouted'));
    expect(quarantine.messageCount).toBe(1);

    // and the event behind it was delivered normally
    await waitFor(() => poolService.callsOf('syncPoolTargetReached').length === 1, 30_000);
  }, 60_000);

  test('the scanner advanced its state, so a restart will not rescan the block', async () => {
    expect(await new ScannerStateRepository().getLastScannedBlock(CHAIN_ID)).toBe(101);
    expect(await EventEntity.countDocuments({ chainId: CHAIN_ID, blockNumber: 101 })).toBe(2);
  });
});
