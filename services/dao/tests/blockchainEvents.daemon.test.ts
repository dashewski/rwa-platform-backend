/**
 * Unit tests for BlockchainEventsDaemon.
 *
 * Scope: routing only — which event name goes to which DaoService method. The
 * RabbitMQ machinery and the delivery pipeline live in @shared/ordered-consumer
 * (covered by the package's own tests); here the DaoService is replaced with an
 * in-memory fake, so these tests need no database, no broker and no network.
 * Run with `bun test` from services/dao.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import {
  BlockchainEventsDaemon,
  BLOCKCHAIN_EVENTS_EXCHANGE,
  BLOCKCHAIN_EVENTS_QUEUE,
} from '../src/daemons/blockchainEvents.daemon';
import type { BlockchainEvent } from '@shared/blockchain';
import type { DaoService } from '../src/services/dao.service';
import { createFakeDaoService, type FakeDaoService } from './fakes/dao.service.fake';

const EVENT: BlockchainEvent = {
  chainId: 1,
  name: 'Governance_VoteCast',
  blockNumber: 42,
  transactionHash: '0xtx1',
  address: '0xGovernance',
  logIndex: 0,
  data: { proposalId: '7', voter: '0xCarol', support: true, weight: '123' },
  timestamp: 1_700_000_000,
};

const ROUTING: Array<[string, keyof FakeDaoService]> = [
  ['Governance_ProposalCreated', 'processProposalCreated'],
  ['Governance_ProposalExecuted', 'processProposalExecuted'],
  ['Governance_ProposalCancelled', 'processProposalCancelled'],
  ['Governance_VoteCast', 'processVoteCast'],
  ['DaoStaking_TokensStaked', 'processTokensStaked'],
  ['DaoStaking_TokensUnstaked', 'processTokensUnstaked'],
  ['DaoStaking_TokensLocked', 'processTokensLocked'],
  ['Timelock_TransactionQueued', 'processTransactionQueued'],
  ['Timelock_TransactionExecuted', 'processTransactionExecuted'],
  ['Timelock_TransactionCancelled', 'processTransactionCancelled'],
  ['Treasury_Withdrawal', 'processTreasuryWithdrawal'],
];

function totalServiceCalls(daoService: FakeDaoService): number {
  return Object.values(daoService).reduce((sum, method) => sum + method.mock.calls.length, 0);
}

describe('BlockchainEventsDaemon (unit, fake service)', () => {
  let daoService: FakeDaoService;
  let daemon: BlockchainEventsDaemon;

  beforeEach(() => {
    daoService = createFakeDaoService();
    // the base machinery (rabbit client, consumer service) is never touched here
    daemon = new BlockchainEventsDaemon({} as any, {} as any, daoService as unknown as DaoService);
  });

  test('the daemon declares the blockchain events exchange and the dao queue', () => {
    expect(BLOCKCHAIN_EVENTS_EXCHANGE).toBe('blockchain.events');
    expect(BLOCKCHAIN_EVENTS_QUEUE).toBe('blockchain.events.dao');
  });

  test('routing: the dao queue binds exactly these events', () => {
    expect(Object.keys(daemon.getEventRouting())).toEqual(ROUTING.map(([eventName]) => eventName));
  });

  test('routing: dispatches every event name to its DaoService method and nothing else', async () => {
    const routing = daemon.getEventRouting();

    for (const [name, method] of ROUTING) {
      await routing[name]({ ...EVENT, name });

      expect(daoService[method]).toHaveBeenCalledTimes(1);
      expect(daoService[method]).toHaveBeenCalledWith({ ...EVENT, name });
    }

    // exactly one service call per delivered message — no double dispatch
    expect(totalServiceCalls(daoService)).toBe(ROUTING.length);
  });

  test('routing: forwards the envelope and the decoded data untouched', async () => {
    await daemon.getEventRouting()[EVENT.name](EVENT);

    const forwarded = daoService.processVoteCast.mock.calls[0][0];
    expect(forwarded).toEqual(EVENT);
    expect((forwarded as BlockchainEvent).data).toEqual(EVENT.data);
  });

  test('routing: a service failure propagates to the retry loop', async () => {
    daoService.processTokensStaked.mockRejectedValueOnce(new Error('db is down'));

    await expect(
      daemon.getEventRouting()['DaoStaking_TokensStaked']({ ...EVENT, name: 'DaoStaking_TokensStaked' }),
    ).rejects.toThrow('db is down');
  });
});
