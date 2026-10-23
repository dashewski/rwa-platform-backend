/**
 * Unit tests for PortfolioService.
 *
 * Scope: the service layer only. Repositories are replaced with in-memory
 * fakes (tests/fakes/*.fake.ts), so these tests need no database, no broker
 * and no network. Run with `bun test` from services/portfolio.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import mongoose from 'mongoose';
import { AppError } from '@shared/errors/app-errors';
import { PortfolioService } from '../src/services/portfolio.service';
import type { TokenBalanceRepository } from '../src/repositories/tokenBalance.repository';
import type { TransactionRepository } from '../src/repositories/transaction.repository';
import {
  createFakeTokenBalanceRepository,
  type FakeTokenBalanceRepository,
} from './fakes/tokenBalance.repository.fake';
import {
  createFakeTransactionRepository,
  type FakeTransactionRepository,
  type CreateTransactionInput,
} from './fakes/transaction.repository.fake';

// Mirrors the private constant in src/services/portfolio.service.ts.
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const FROM = '0x1111111111111111111111111111111111111111';
const TO = '0x2222222222222222222222222222222222222222';
const OTHER = '0x9999999999999999999999999999999999999999';
const TOKEN_ADDRESS = '0x3333333333333333333333333333333333333333';
const POOL_ADDRESS = '0x4444444444444444444444444444444444444444';
const CHAIN_ID = '137';
const TOKEN_ID = '7';

// The event as the scanner publishes it: decoded fields in `data`, the
// envelope (name, chainId, transactionHash, logIndex, blockNumber) on the root.
const TRANSFER = {
  name: 'RWA_Transfer',
  address: TOKEN_ADDRESS,
  chainId: CHAIN_ID,
  transactionHash: '0xtransfer0001',
  logIndex: 0,
  blockNumber: 123,
  timestamp: 1_700_000_000,
  data: {
    emittedFrom: TOKEN_ADDRESS,
    from: FROM,
    to: TO,
    tokenId: TOKEN_ID,
    amount: '250',
    pool: POOL_ADDRESS,
  },
};

describe('PortfolioService (unit, fake repositories)', () => {
  let balances: FakeTokenBalanceRepository;
  let transactions: FakeTransactionRepository;
  let service: PortfolioService;
  let commitInbox: ReturnType<typeof mock<() => Promise<void>>>;
  let transfer: (event: any) => Promise<void>;

  beforeEach(() => {
    // The service writes the rows and the inbox marker in one transaction.
    (mongoose.connection as unknown as { transaction: unknown }).transaction = async <T>(
      fn: () => Promise<T>,
    ): Promise<T> => fn();

    commitInbox = mock(async (): Promise<void> => undefined);
    balances = createFakeTokenBalanceRepository();
    transactions = createFakeTransactionRepository();
    service = new PortfolioService(
      balances as unknown as TokenBalanceRepository,
      transactions as unknown as TransactionRepository,
    );
    transfer = (event: any) => service.processTransfer(event, commitInbox);
  });

  function balanceOf(owner: string) {
    return balances.store.get(
      balances.keyOf({
        owner,
        tokenAddress: TOKEN_ADDRESS,
        tokenId: TOKEN_ID,
        poolAddress: POOL_ADDRESS,
        chainId: CHAIN_ID,
      }),
    );
  }

  function seedTransaction(overrides: Partial<CreateTransactionInput> = {}) {
    return transactions.create({
      from: FROM,
      to: TO,
      tokenAddress: TOKEN_ADDRESS,
      tokenId: TOKEN_ID,
      poolAddress: POOL_ADDRESS,
      chainId: CHAIN_ID,
      transactionHash: '0xtx0001',
      logIndex: 0,
      blockNumber: 100,
      amount: 1,
      ...overrides,
    });
  }

  test('processTransfer: records the transaction and moves the balance in both directions', async () => {
    await transfer(TRANSFER);

    expect(transactions.create).toHaveBeenCalledTimes(1);
    expect(transactions.create).toHaveBeenCalledWith({
      from: FROM,
      to: TO,
      tokenAddress: TOKEN_ADDRESS,
      tokenId: TOKEN_ID,
      poolAddress: POOL_ADDRESS,
      chainId: CHAIN_ID,
      transactionHash: '0xtransfer0001',
      logIndex: 0,
      blockNumber: 123,
      amount: 250,
    });
    expect(transactions.store.size).toBe(1);

    // The sender is debited first, the receiver is credited second.
    expect(balances.updateBalance).toHaveBeenCalledTimes(2);
    expect(balances.updateBalance.mock.calls[0]).toEqual([
      FROM,
      TOKEN_ADDRESS,
      TOKEN_ID,
      POOL_ADDRESS,
      CHAIN_ID,
      -250,
      123,
    ]);
    expect(balances.updateBalance.mock.calls[1]).toEqual([
      TO,
      TOKEN_ADDRESS,
      TOKEN_ID,
      POOL_ADDRESS,
      CHAIN_ID,
      250,
      123,
    ]);

    // Balances are plain increments: the sender ends up negative when the fake
    // holds no prior position, and nothing in the service clamps at zero.
    expect(balanceOf(FROM)?.balance).toBe(-250);
    expect(balanceOf(FROM)?.lastUpdateBlock).toBe(123);
    expect(balanceOf(TO)?.balance).toBe(250);
  });

  test('processTransfer: accumulates the position across transfers', async () => {
    await transfer({ ...TRANSFER, data: { ...TRANSFER.data, from: OTHER, amount: '100' } });
    await transfer({
      ...TRANSFER,
      blockNumber: 124,
      data: { ...TRANSFER.data, from: OTHER, amount: '40' },
    });

    expect(transactions.store.size).toBe(2);
    // One document per (owner, token, tokenId, pool, chain) position.
    expect(balances.store.size).toBe(2);
    expect(balanceOf(TO)?.balance).toBe(140);
    expect(balanceOf(TO)?.lastUpdateBlock).toBe(124);
  });
  test('processTransfer: a mint from the zero address credits the receiver only', async () => {
    await transfer({ ...TRANSFER, data: { ...TRANSFER.data, from: ZERO_ADDRESS, amount: '1000' } });

    expect(transactions.create).toHaveBeenCalledTimes(1);
    expect(transactions.create).toHaveBeenCalledWith(expect.objectContaining({ from: ZERO_ADDRESS, amount: 1000 }));

    // No debit leg: the zero address is never written to.
    expect(balances.updateBalance).toHaveBeenCalledTimes(1);
    expect(balances.updateBalance.mock.calls[0]).toEqual([
      TO,
      TOKEN_ADDRESS,
      TOKEN_ID,
      POOL_ADDRESS,
      CHAIN_ID,
      1000,
      123,
    ]);
    expect(balanceOf(TO)?.balance).toBe(1000);
  });

  test('processTransfer: a burn to the zero address debits the sender only', async () => {
    await transfer({ ...TRANSFER, data: { ...TRANSFER.data, to: ZERO_ADDRESS, amount: '500' } });

    expect(transactions.create).toHaveBeenCalledTimes(1);
    expect(balances.updateBalance).toHaveBeenCalledTimes(1);
    expect(balances.updateBalance.mock.calls[0]).toEqual([
      FROM,
      TOKEN_ADDRESS,
      TOKEN_ID,
      POOL_ADDRESS,
      CHAIN_ID,
      -500,
      123,
    ]);
    expect(balanceOf(FROM)?.balance).toBe(-500);
  });

  test('processTransfer: a self-transfer applies both legs to the same position', async () => {
    await transfer({ ...TRANSFER, data: { ...TRANSFER.data, to: FROM, amount: '30' } });

    // from === to is not special-cased: both legs run, so the net effect on the
    // stored balance is zero while the transaction row is still recorded.
    expect(transactions.create).toHaveBeenCalledTimes(1);
    expect(balances.updateBalance).toHaveBeenCalledTimes(2);
    expect(balances.updateBalance.mock.calls[0][5]).toBe(-30);
    expect(balances.updateBalance.mock.calls[1][5]).toBe(30);
    expect(balances.store.size).toBe(1);
    expect(balanceOf(FROM)?.balance).toBe(0);
  });

  test('processTransfer: propagates an AppError from the transaction repository', async () => {
    transactions.create.mockImplementation(async () => {
      throw new AppError({ message: 'Transaction write failed', statusCode: 503, code: 'SERVICE_UNAVAILABLE' });
    });

    await expect(transfer(TRANSFER)).rejects.toMatchObject({
      statusCode: 503,
      code: 'SERVICE_UNAVAILABLE',
    });

    expect(transactions.store.size).toBe(0);
    expect(balances.updateBalance).toHaveBeenCalledTimes(0);
  });

  test('processTransfer: propagates a balance update failure after the transaction row was written', async () => {
    balances.updateBalance.mockImplementation(async () => {
      throw new AppError({ message: 'Database unavailable', statusCode: 503, code: 'SERVICE_UNAVAILABLE' });
    });

    await expect(transfer(TRANSFER)).rejects.toMatchObject({
      statusCode: 503,
      code: 'SERVICE_UNAVAILABLE',
    });

    // The debit failed, so the credit was never attempted...
    expect(balances.updateBalance).toHaveBeenCalledTimes(1);
    // ...and the transaction row stays behind: the service does not compensate.
    // Exactly-once is enforced one layer up (daemon -> processEventExactlyOnce).
    expect(transactions.store.size).toBe(1);
  });

  test('getBalances: forwards filter/sort/pagination unchanged and maps every row', async () => {
    await balances.updateBalance(FROM, TOKEN_ADDRESS, TOKEN_ID, POOL_ADDRESS, CHAIN_ID, 100, 10);
    await balances.updateBalance(OTHER, TOKEN_ADDRESS, TOKEN_ID, POOL_ADDRESS, CHAIN_ID, 55, 11);

    const result = await service.getBalances({
      filter: { owner: FROM },
      sort: { lastUpdateBlock: 'desc' },
      limit: 10,
      offset: 0,
    });

    expect(balances.findAll).toHaveBeenCalledWith({ owner: FROM }, { lastUpdateBlock: 'desc' }, 10, 0);
    expect(result).toHaveLength(1);

    const row = result[0];
    expect(row.owner).toBe(FROM);
    expect(row.tokenAddress).toBe(TOKEN_ADDRESS);
    expect(row.tokenId).toBe(TOKEN_ID);
    expect(row.poolAddress).toBe(POOL_ADDRESS);
    expect(row.chainId).toBe(CHAIN_ID);
    expect(row.balance).toBe(100);
    expect(row.lastUpdateBlock).toBe(10);
    expect(typeof row.id).toBe('string');
    expect(row.id).toHaveLength(24); // Mongo ObjectId hex
    expect(row).not.toHaveProperty('_id');
    // The result must be plain JSON - no ObjectId or class instances leaking to the caller.
    expect(JSON.parse(JSON.stringify(row))).toEqual(row);
  });

  test('getBalances: forwards omitted params as undefined and lets the repository default them', async () => {
    await service.getBalances({});

    // The `{}` fallback in the service only feeds span attributes; the query
    // receives params.filter as-is.
    expect(balances.findAll).toHaveBeenCalledWith(undefined, undefined, undefined, undefined);
    expect(balances.findAll).toHaveBeenCalledTimes(1);
  });

  test('getBalances: returns an empty array when nothing matches', async () => {
    await balances.updateBalance(FROM, TOKEN_ADDRESS, TOKEN_ID, POOL_ADDRESS, CHAIN_ID, 100, 10);

    const result = await service.getBalances({ filter: { owner: 'nobody' } });

    expect(result).toEqual([]);
  });

  test('getTransactions: forwards the filter unchanged and maps every row', async () => {
    await seedTransaction({ from: FROM, transactionHash: '0xtx0001', blockNumber: 100, amount: 1.5 });
    await seedTransaction({ from: OTHER, transactionHash: '0xtx0002', blockNumber: 101, amount: 2 });

    const result = await service.getTransactions({
      filter: { from: FROM },
      sort: { blockNumber: 'asc' },
      limit: 5,
      offset: 0,
    });

    expect(transactions.findAll).toHaveBeenCalledWith({ from: FROM }, { blockNumber: 'asc' }, 5, 0);
    expect(result).toHaveLength(1);

    const row = result[0];
    expect(row.from).toBe(FROM);
    expect(row.to).toBe(TO);
    expect(row.tokenAddress).toBe(TOKEN_ADDRESS);
    expect(row.tokenId).toBe(TOKEN_ID);
    expect(row.poolAddress).toBe(POOL_ADDRESS);
    expect(row.chainId).toBe(CHAIN_ID);
    expect(row.transactionHash).toBe('0xtx0001');
    expect(row.blockNumber).toBe(100);
    expect(row.amount).toBe(1.5);
    expect(typeof row.id).toBe('string');
    expect(row.id).toHaveLength(24);
    expect(row).not.toHaveProperty('_id');
    expect(JSON.parse(JSON.stringify(row))).toEqual(row);
  });

  test('getTransactions: returns an empty array when nothing matches', async () => {
    await seedTransaction();

    const result = await service.getTransactions({ filter: { from: 'nobody' } });

    expect(result).toEqual([]);
  });
});
