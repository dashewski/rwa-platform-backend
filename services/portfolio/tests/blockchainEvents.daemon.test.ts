/**
 * Unit tests for BlockchainEventsDaemon.
 *
 * Scope: routing only — the RWA_Transfer mapping onto PortfolioService. The
 * RabbitMQ machinery and the delivery pipeline live in @shared/ordered-consumer
 * (covered by the package's own tests); the service is either an in-memory spy
 * or the real class on fake repositories, so these tests need no database, no
 * broker and no network. Run with `bun test` from services/portfolio.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  BlockchainEventsDaemon,
  BLOCKCHAIN_EVENTS_EXCHANGE,
  BLOCKCHAIN_EVENTS_QUEUE,
} from '../src/daemons/blockchainEvents.daemon';
import type { BlockchainEvent } from '@shared/blockchain';
import { PortfolioService } from '../src/services/portfolio.service';
import type { TokenBalanceRepository } from '../src/repositories/tokenBalance.repository';
import type { TransactionRepository } from '../src/repositories/transaction.repository';
import {
  createFakeTokenBalanceRepository,
  type FakeTokenBalanceRepository,
} from './fakes/tokenBalance.repository.fake';
import { createFakeTransactionRepository, type FakeTransactionRepository } from './fakes/transaction.repository.fake';

const FROM = '0x1111111111111111111111111111111111111111';
const TO = '0x2222222222222222222222222222222222222222';
const TOKEN_ADDRESS = '0x3333333333333333333333333333333333333333';
const POOL_ADDRESS = '0x4444444444444444444444444444444444444444';

/** Synthetic RWA_Transfer event as published by the blockchain scanner. */
const TRANSFER_EVENT: BlockchainEvent = {
  chainId: 137,
  name: 'RWA_Transfer',
  blockNumber: 42,
  transactionHash: '0xe2e2e2e2',
  address: '0x9999999999999999999999999999999999999999',
  logIndex: 3,
  data: {
    emittedFrom: TOKEN_ADDRESS, // the RWA token contract that emitted the event
    from: FROM,
    to: TO,
    tokenId: '7',
    amount: '250',
    pool: POOL_ADDRESS,
  },
  timestamp: 1_700_000_000,
};

type TransferPayload = {
  from: string;
  to: string;
  tokenAddress: string;
  tokenId: string;
  chainId: string;
  transactionHash: string;
  blockNumber: number;
  amount: number;
  poolAddress: string;
};

function createPortfolioServiceSpy() {
  return {
    processTransfer: mock(async (_data: TransferPayload) => {}),
  };
}

describe('BlockchainEventsDaemon (unit, service spy)', () => {
  let serviceSpy: ReturnType<typeof createPortfolioServiceSpy>;
  let daemon: BlockchainEventsDaemon;

  beforeEach(() => {
    serviceSpy = createPortfolioServiceSpy();
    // the base machinery (rabbit client, consumer service) is never touched here
    daemon = new BlockchainEventsDaemon({} as any, {} as any, serviceSpy as unknown as PortfolioService);
  });

  test('the daemon declares the blockchain events exchange and the portfolio queue', () => {
    expect(BLOCKCHAIN_EVENTS_EXCHANGE).toBe('blockchain.events');
    expect(BLOCKCHAIN_EVENTS_QUEUE).toBe('blockchain.events.portfolio');
  });

  test('routing: exposes exactly the RWA_Transfer handler', () => {
    const routing = daemon.getEventRouting();

    expect(Object.keys(routing)).toEqual(['RWA_Transfer']);
    expect(typeof routing['RWA_Transfer']).toBe('function');
  });

  test('RWA_Transfer: maps the scan payload onto processTransfer', async () => {
    await daemon.getEventRouting()['RWA_Transfer'](TRANSFER_EVENT);

    expect(serviceSpy.processTransfer).toHaveBeenCalledTimes(1);
    expect(serviceSpy.processTransfer).toHaveBeenCalledWith({
      from: FROM,
      to: TO,
      tokenAddress: TOKEN_ADDRESS, // emittedFrom, not the scanner-side `address`
      tokenId: '7',
      chainId: '137', // event.chainId is stringified for the balance key
      transactionHash: '0xe2e2e2e2',
      blockNumber: 42,
      amount: 250, // the '250' string from the event data becomes a number
      poolAddress: POOL_ADDRESS,
    });
  });

  test('RWA_Transfer: normalizes numeric fields before calling the service', async () => {
    const routing = daemon.getEventRouting();

    await routing['RWA_Transfer']({ ...TRANSFER_EVENT, data: { ...TRANSFER_EVENT.data, amount: '0.5' } });
    await routing['RWA_Transfer']({ ...TRANSFER_EVENT, data: { ...TRANSFER_EVENT.data, amount: 3 } });

    const payloads = serviceSpy.processTransfer.mock.calls.map((call) => call[0]);

    expect(payloads).toHaveLength(2);
    expect(payloads[0].amount).toBe(0.5);
    expect(typeof payloads[0].amount).toBe('number');
    expect(payloads[1].amount).toBe(3);
    expect(payloads.every((payload) => typeof payload.chainId === 'string')).toBe(true);
  });

  test('RWA_Transfer: drives the real service onto the fake repositories', async () => {
    const balances: FakeTokenBalanceRepository = createFakeTokenBalanceRepository();
    const transactions: FakeTransactionRepository = createFakeTransactionRepository();
    const service = new PortfolioService(
      balances as unknown as TokenBalanceRepository,
      transactions as unknown as TransactionRepository,
    );
    const wiredDaemon = new BlockchainEventsDaemon({} as any, {} as any, service);

    await wiredDaemon.getEventRouting()['RWA_Transfer'](TRANSFER_EVENT);

    expect(transactions.store.size).toBe(1);
    const transaction = Array.from(transactions.store.values())[0];
    expect(transaction?.from).toBe(FROM);
    expect(transaction?.to).toBe(TO);
    expect(transaction?.tokenAddress).toBe(TOKEN_ADDRESS);
    expect(transaction?.poolAddress).toBe(POOL_ADDRESS);
    expect(transaction?.tokenId).toBe('7');
    expect(transaction?.chainId).toBe('137');
    expect(transaction?.transactionHash).toBe('0xe2e2e2e2');
    expect(transaction?.blockNumber).toBe(42);
    expect(transaction?.amount).toBe(250);

    const position = (owner: string) =>
      balances.store.get(
        balances.keyOf({
          owner,
          tokenAddress: TOKEN_ADDRESS,
          tokenId: '7',
          poolAddress: POOL_ADDRESS,
          chainId: '137',
        }),
      );

    expect(balances.store.size).toBe(2);
    expect(position(FROM)?.balance).toBe(-250);
    expect(position(TO)?.balance).toBe(250);
  });
});
