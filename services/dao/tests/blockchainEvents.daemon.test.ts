/**
 * Unit tests for the DAO blockchain events daemon.
 *
 * Scope: the daemon's own wiring and routing only. The RabbitMQ client is an
 * in-memory fake that captures the consumer callback (tests drive synthetic
 * messages through it), and DaoService is replaced with a fake whose
 * interactions are asserted. The base daemon runs every handler inside
 * processEventExactlyOnce() — a MongoDB transaction plus a dedup-marker
 * insert — so the tests replace those two persistence primitives with
 * in-memory no-ops (see stubExactlyOncePersistence) and never touch a database.
 * Processing failures hold the queue: the same message is retried in place
 * (blocking every later event) instead of being nacked, so the daemon is
 * constructed with tiny retry delays and the tests observe in-flight retries.
 * Run with `bun test` from services/dao.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import mongoose from 'mongoose';
import { AppError } from '@shared/errors/app-errors';
import type { BlockchainEvent } from '@shared/blockchain-daemon/src/baseBlockchain.daemon';
import type { RabbitMQClient } from '@shared/rabbitmq/src/rabbitmq.client';
import type { DaoService } from '../src/services/dao.service';
import { BlockchainEventsDaemon } from '../src/daemons/blockchainEvents.daemon';
import {
  createFakeRabbitMQClient,
  type FakeConsumeMessage,
  type FakeRabbitMQClient,
} from './fakes/rabbitmq.client.fake';
import { createFakeDaoService, type FakeDaoService } from './fakes/dao.service.fake';

const QUEUE_NAME = 'blockchain.events.dao';
const EXCHANGE_NAME = 'blockchain.events';

/** Test double exposing the daemon's protected routing table. */
class TestableBlockchainEventsDaemon extends BlockchainEventsDaemon {
  getRouting() {
    return this.getEventRouting();
  }
}

/**
 * processEventExactlyOnce() opens a Mongo transaction and inserts a unique
 * processed-events marker before running the handler. Both are replaced here
 * with in-memory no-ops: the transaction becomes a passthrough and the marker
 * insert always succeeds, so the message pipeline stays database-free.
 */
function stubExactlyOncePersistence() {
  (mongoose.connection as any).transaction = async (fn: () => Promise<unknown>) => {
    await fn();
  };

  (mongoose.models as any)['ProcessedEvent'] = {
    create: async () => ({}),
    exists: async () => null,
  };
}

function blockchainEvent(name: string, data: Record<string, unknown>): BlockchainEvent {
  return {
    chainId: 1,
    name,
    blockNumber: 123456,
    transactionHash: '0xbigeventtx',
    address: '0xGovernance',
    logIndex: 0,
    data,
    timestamp: 1_700_000_000,
  };
}

/** Message as delivered by the broker: the event JSON in `content`. */
function messageFor(event: BlockchainEvent): FakeConsumeMessage {
  return {
    content: Buffer.from(JSON.stringify(event)),
    fields: { deliveryTag: 1 },
    properties: { headers: {} },
  };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Polls until the predicate is true (used to observe in-flight retries). */
async function waitFor(predicate: () => boolean, timeoutMs = 3_000): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('waitFor: timed out');
    }
    await sleep(5);
  }
}

/** event.data exactly as the scanner decodes it (contract fields only). */
const PROPOSAL_CREATED_DATA = {
  emittedFrom: '0xGovernance',
  proposalId: '7',
  proposer: '0xAlice',
  target: '0xTreasury',
  data: '0xdeadbeef',
  description: 'Raise the staking cap',
  votesFor: '0',
  votesAgainst: '0',
  creationTime: '1700000000',
  endTime: '1700086400',
  executed: false,
  cancelled: false,
};

const VOTE_CAST_DATA = {
  emittedFrom: '0xGovernance',
  proposalId: '7',
  voter: '0xCarol',
  support: true,
  weight: '123.45',
  reason: 'Good proposal',
};

const STAKING_DATA = {
  emittedFrom: '0xStaking',
  staker: '0xBob',
  amount: '250',
  newVotingPower: '250',
};

const TOKENS_LOCKED_DATA = {
  emittedFrom: '0xStaking',
  user: '0xBob',
  unlockTimestamp: '1700086400',
};

const TIMELOCK_DATA = {
  emittedFrom: '0xTimelock',
  txHash: '0xtimelock1',
  target: '0xTreasury',
  data: '0xdeadbeef',
  eta: '1700090000',
};

const TREASURY_WITHDRAWAL_DATA = {
  emittedFrom: '0xTreasury',
  to: '0xBob',
  token: '0xToken',
  amount: '500',
};

describe('BlockchainEventsDaemon (unit, fake rabbit client and fake service)', () => {
  let rabbit: FakeRabbitMQClient;
  let daoService: FakeDaoService;
  let daemon: TestableBlockchainEventsDaemon;

  beforeEach(() => {
    stubExactlyOncePersistence();
    rabbit = createFakeRabbitMQClient();
    daoService = createFakeDaoService();
    daemon = new TestableBlockchainEventsDaemon(
      rabbit as unknown as RabbitMQClient,
      daoService as unknown as DaoService,
      { initialDelayMs: 1, maxDelayMs: 2 },
    );
  });

  test('initialize: declares the dao topology and starts consuming the dao queue', async () => {
    await daemon.initialize();

    expect(rabbit.setupExchange).toHaveBeenCalledWith(EXCHANGE_NAME, 'direct', { durable: true });
    expect(rabbit.setupExchange).toHaveBeenCalledWith(`${QUEUE_NAME}.retry.exchange`, 'direct', { durable: true });

    expect(rabbit.setupQueue).toHaveBeenCalledWith(QUEUE_NAME, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': `${QUEUE_NAME}.retry.exchange`,
        'x-dead-letter-routing-key': `${QUEUE_NAME}.retry`,
      },
    });
    expect(rabbit.setupQueue).toHaveBeenCalledWith(`${QUEUE_NAME}.retry`, {
      durable: true,
      arguments: {
        'x-message-ttl': 10_000,
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': QUEUE_NAME,
      },
    });
    expect(rabbit.setupQueue).toHaveBeenCalledWith(`${QUEUE_NAME}.parked`, { durable: true });

    // One binding per routed event, plus the retry binding.
    expect(rabbit.bindQueue).toHaveBeenCalledTimes(12);
    for (const eventName of Object.keys(daemon.getRouting())) {
      expect(rabbit.bindQueue).toHaveBeenCalledWith(QUEUE_NAME, EXCHANGE_NAME, eventName);
    }
    expect(rabbit.bindQueue).toHaveBeenCalledWith(
      `${QUEUE_NAME}.retry`,
      `${QUEUE_NAME}.retry.exchange`,
      `${QUEUE_NAME}.retry`,
    );

    expect(rabbit.consume).toHaveBeenCalledWith(QUEUE_NAME, expect.any(Function), { noAck: false, prefetch: 1 });
    expect(rabbit.consumerFor(QUEUE_NAME)).toBeInstanceOf(Function);
  });

  test('getEventRouting: covers exactly the DAO contract events', () => {
    const routing = daemon.getRouting();

    expect(Object.keys(routing).sort()).toEqual([
      'DaoStaking_TokensLocked',
      'DaoStaking_TokensStaked',
      'DaoStaking_TokensUnstaked',
      'Governance_ProposalCancelled',
      'Governance_ProposalCreated',
      'Governance_ProposalExecuted',
      'Governance_VoteCast',
      'Timelock_TransactionCancelled',
      'Timelock_TransactionExecuted',
      'Timelock_TransactionQueued',
      'Treasury_Withdrawal',
    ]);
  });

  test('Governance_ProposalCreated routes to processProposalCreated', async () => {
    const event = blockchainEvent('Governance_ProposalCreated', PROPOSAL_CREATED_DATA);

    await daemon.getRouting()[event.name](event);

    expect(daoService.processProposalCreated).toHaveBeenCalledTimes(1);
    // The full event is forwarded: contract fields live in `data`, the
    // envelope (chainId, transactionHash, logIndex, blockNumber) on the root.
    expect(daoService.processProposalCreated).toHaveBeenCalledWith(event);
    // Only the routed handler runs.
    expect(daoService.processProposalExecuted).not.toHaveBeenCalled();
    expect(daoService.processVoteCast).not.toHaveBeenCalled();
  });

  test('Governance_ProposalExecuted routes to processProposalExecuted', async () => {
    const event = blockchainEvent('Governance_ProposalExecuted', {
      emittedFrom: '0xGovernance',
      proposalId: '7',
      executor: '0xAlice',
    });

    await daemon.getRouting()[event.name](event);

    expect(daoService.processProposalExecuted).toHaveBeenCalledTimes(1);
    expect(daoService.processProposalExecuted).toHaveBeenCalledWith(event);
  });

  test('Governance_ProposalCancelled routes to processProposalCancelled', async () => {
    const event = blockchainEvent('Governance_ProposalCancelled', {
      emittedFrom: '0xGovernance',
      proposalId: '7',
      canceller: '0xAlice',
    });

    await daemon.getRouting()[event.name](event);

    expect(daoService.processProposalCancelled).toHaveBeenCalledTimes(1);
    expect(daoService.processProposalCancelled).toHaveBeenCalledWith(event);
  });

  test('Governance_VoteCast routes to processVoteCast', async () => {
    const event = blockchainEvent('Governance_VoteCast', VOTE_CAST_DATA);

    await daemon.getRouting()[event.name](event);

    expect(daoService.processVoteCast).toHaveBeenCalledTimes(1);
    expect(daoService.processVoteCast).toHaveBeenCalledWith(event);
  });

  test('DaoStaking_TokensStaked routes to processTokensStaked', async () => {
    const event = blockchainEvent('DaoStaking_TokensStaked', STAKING_DATA);

    await daemon.getRouting()[event.name](event);

    expect(daoService.processTokensStaked).toHaveBeenCalledTimes(1);
    expect(daoService.processTokensStaked).toHaveBeenCalledWith(event);
  });

  test('DaoStaking_TokensUnstaked routes to processTokensUnstaked', async () => {
    const event = blockchainEvent('DaoStaking_TokensUnstaked', STAKING_DATA);

    await daemon.getRouting()[event.name](event);

    expect(daoService.processTokensUnstaked).toHaveBeenCalledTimes(1);
    expect(daoService.processTokensUnstaked).toHaveBeenCalledWith(event);
  });

  test('DaoStaking_TokensLocked routes to processTokensLocked', async () => {
    const event = blockchainEvent('DaoStaking_TokensLocked', TOKENS_LOCKED_DATA);

    await daemon.getRouting()[event.name](event);

    expect(daoService.processTokensLocked).toHaveBeenCalledTimes(1);
    expect(daoService.processTokensLocked).toHaveBeenCalledWith(event);
  });

  test('Timelock_TransactionQueued routes to processTransactionQueued', async () => {
    const event = blockchainEvent('Timelock_TransactionQueued', TIMELOCK_DATA);

    await daemon.getRouting()[event.name](event);

    expect(daoService.processTransactionQueued).toHaveBeenCalledTimes(1);
    expect(daoService.processTransactionQueued).toHaveBeenCalledWith(event);
  });

  test('Timelock_TransactionExecuted routes to processTransactionExecuted', async () => {
    const event = blockchainEvent('Timelock_TransactionExecuted', TIMELOCK_DATA);

    await daemon.getRouting()[event.name](event);

    expect(daoService.processTransactionExecuted).toHaveBeenCalledTimes(1);
    expect(daoService.processTransactionExecuted).toHaveBeenCalledWith(event);
  });

  test('Timelock_TransactionCancelled routes to processTransactionCancelled', async () => {
    const event = blockchainEvent('Timelock_TransactionCancelled', TIMELOCK_DATA);

    await daemon.getRouting()[event.name](event);

    expect(daoService.processTransactionCancelled).toHaveBeenCalledTimes(1);
    expect(daoService.processTransactionCancelled).toHaveBeenCalledWith(event);
  });

  test('Treasury_Withdrawal routes to processTreasuryWithdrawal', async () => {
    const event = blockchainEvent('Treasury_Withdrawal', TREASURY_WITHDRAWAL_DATA);

    await daemon.getRouting()[event.name](event);

    expect(daoService.processTreasuryWithdrawal).toHaveBeenCalledTimes(1);
    expect(daoService.processTreasuryWithdrawal).toHaveBeenCalledWith(event);
  });

  test('consume callback: an event without a handler is acknowledged and ignored', async () => {
    await daemon.initialize();
    const consumer = rabbit.consumerFor(QUEUE_NAME)!;

    const message = messageFor(blockchainEvent('Some_UnknownEvent', { anything: true }));

    await consumer(message);

    expect(rabbit.ack).toHaveBeenCalledTimes(1);
    expect(rabbit.ack).toHaveBeenCalledWith(message);
    expect(rabbit.nack).not.toHaveBeenCalled();
    for (const method of Object.values(daoService)) expect(method).not.toHaveBeenCalled();
  });

  test('consume callback: a routed event reaches the service and is acknowledged', async () => {
    await daemon.initialize();
    const consumer = rabbit.consumerFor(QUEUE_NAME)!;

    const event = blockchainEvent('Governance_VoteCast', VOTE_CAST_DATA);
    const message = messageFor(event);

    await consumer(message);

    expect(daoService.processVoteCast).toHaveBeenCalledTimes(1);
    expect(daoService.processVoteCast).toHaveBeenCalledWith(event);
    expect(rabbit.ack).toHaveBeenCalledWith(message);
    expect(rabbit.nack).not.toHaveBeenCalled();
  });

  test('consume callback: a failed event is retried in place — same message, ack only after it succeeds, never a nack', async () => {
    await daemon.initialize();
    const consumer = rabbit.consumerFor(QUEUE_NAME)!;

    daoService.processVoteCast.mockImplementationOnce(async () => {
      throw new AppError({ message: 'Vote write failed', statusCode: 500, code: 'INTERNAL_ERROR' });
    });

    const event = blockchainEvent('Governance_VoteCast', VOTE_CAST_DATA);
    const message = messageFor(event);

    await consumer(message);

    // The failure did not move the message anywhere: the same event was
    // re-processed and only then acknowledged.
    expect(daoService.processVoteCast).toHaveBeenCalledTimes(2);
    expect(daoService.processVoteCast.mock.calls[1][0]).toEqual(daoService.processVoteCast.mock.calls[0][0]);
    expect(daoService.processVoteCast.mock.calls[1][0]).toMatchObject({
      name: 'Governance_VoteCast',
      transactionHash: event.transactionHash,
      logIndex: event.logIndex,
    });

    expect(rabbit.ack).toHaveBeenCalledTimes(1);
    expect(rabbit.ack).toHaveBeenCalledWith(message);
    expect(rabbit.nack).not.toHaveBeenCalled();
    expect(rabbit.sendToQueue).not.toHaveBeenCalled();
  });
  
  test('consume callback: a committed duplicate marker is acknowledged without rerunning the handler', async () => {
    await daemon.initialize();
    const consumer = rabbit.consumerFor(QUEUE_NAME)!;
    const processedEventModel = (mongoose.models as any)['ProcessedEvent'];

    processedEventModel.create = async () => {
      const error: any = new Error('E11000 duplicate key error');
      error.code = 11000;
      throw error;
    };
    processedEventModel.exists = async () => ({ _id: 'already-processed' });

    const event = blockchainEvent('Governance_VoteCast', VOTE_CAST_DATA);
    const message = messageFor(event);

    await consumer(message);

    expect(daoService.processVoteCast).toHaveBeenCalledTimes(0);
    expect(rabbit.ack).toHaveBeenCalledTimes(1);
    expect(rabbit.ack).toHaveBeenCalledWith(message);
    expect(rabbit.nack).not.toHaveBeenCalled();
  });

  test('consume callback: a handler E11000 is retried when no processed-event marker exists', async () => {
    await daemon.initialize();
    const consumer = rabbit.consumerFor(QUEUE_NAME)!;
    const processedEventModel = (mongoose.models as any)['ProcessedEvent'];

    processedEventModel.create = async () => ({});
    processedEventModel.exists = async () => null;

    const event = blockchainEvent('Governance_VoteCast', VOTE_CAST_DATA);
    const message = messageFor(event);
    daoService.processVoteCast.mockImplementationOnce(async () => {
      const error: any = new Error('E11000 handler unique index violation');
      error.code = 11000;
      error.keyValue = {
        transactionHash: event.transactionHash,
        logIndex: event.logIndex,
      };
      throw error;
    });

    await consumer(message);

    // The first E11000 came from the handler, not the processed-events marker,
    // so it must be retried instead of being mistaken for a duplicate delivery.
    expect(daoService.processVoteCast).toHaveBeenCalledTimes(2);
    expect(rabbit.ack).toHaveBeenCalledTimes(1);
    expect(rabbit.ack).toHaveBeenCalledWith(message);
    expect(rabbit.nack).not.toHaveBeenCalled();
  });

  test('consume callback: a held event blocks the queue — no ack, no nack, no later event until it succeeds', async () => {
    await daemon.initialize();
    const consumer = rabbit.consumerFor(QUEUE_NAME)!;

    const processed: string[] = [];
    let releaseHeld: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      releaseHeld = resolve;
    });
    let firstAttempts = 0;

    daoService.processVoteCast.mockImplementation(async (event: any) => {
      if (event.data.proposalId === '1') {
        firstAttempts += 1;
        if (firstAttempts === 1) {
          throw new AppError({ message: 'db down', statusCode: 503, code: 'SERVICE_UNAVAILABLE' });
        }
        await held;
        processed.push('1');
        return;
      }
      processed.push(event.data.proposalId);
    });

    const first = messageFor(blockchainEvent('Governance_VoteCast', { ...VOTE_CAST_DATA, proposalId: '1' }));
    const second = messageFor(blockchainEvent('Governance_VoteCast', { ...VOTE_CAST_DATA, proposalId: '2' }));

    const processingFirst = consumer(first);
    await waitFor(() => firstAttempts >= 2);

    // The next event arrives while the first one is still held mid-retry.
    const processingSecond = consumer(second);
    await sleep(30);

    // Nothing acknowledged, nothing nacked: the queue is held and the second
    // event is still waiting behind the first one.
    expect(rabbit.ack).not.toHaveBeenCalled();
    expect(rabbit.nack).not.toHaveBeenCalled();
    expect(processed).toEqual([]);

    releaseHeld();
    await processingFirst;
    await processingSecond;

    // Strict order: the first event finished before the second started.
    expect(processed).toEqual(['1', '2']);
    expect(rabbit.acked).toEqual([first, second]);
  });

  test('consume callback: an unparseable payload is parked and acknowledged — the only non-blocking exception', async () => {
    await daemon.initialize();
    const consumer = rabbit.consumerFor(QUEUE_NAME)!;

    const message: FakeConsumeMessage = {
      content: Buffer.from('not-json'),
      fields: { deliveryTag: 1 },
      properties: { headers: {} },
    };

    await consumer(message);

    expect(rabbit.sendToQueue).toHaveBeenCalledWith(
      `${QUEUE_NAME}.parked`,
      expect.objectContaining({ reason: 'Invalid payload (not a JSON event)', content: 'not-json' }),
    );
    expect(rabbit.ack).toHaveBeenCalledWith(message);
    expect(rabbit.nack).not.toHaveBeenCalled();
    for (const method of Object.values(daoService)) expect(method).not.toHaveBeenCalled();
  });
});
