import { TokenBalanceRepository } from '../repositories/tokenBalance.repository';
import { TransactionRepository } from '../repositories/transaction.repository';
import type { ITokenBalanceEntity } from '../models/entity/tokenBalance.entity';
import type { ITransactionEntity } from '../models/entity/transaction.entity';
import mongoose from 'mongoose';
import type { SortOrder } from 'mongoose';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import { MetricsDecorator } from '@shared/monitoring/src/metricsDecorator';
import { LogDecorator } from '@shared/monitoring/src/logDecorator';
import { setSpanAttributes } from '@shared/monitoring/src/tracing';
import type { BlockchainEvent } from '@shared/blockchain';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export class PortfolioService {
  constructor(
    private readonly tokenBalanceRepository: TokenBalanceRepository,
    private readonly transactionRepository: TransactionRepository,
  ) {
    mongoose.set('transactionAsyncLocalStorage', true);
  }

  /**
   * Gets token balances list with filters, pagination and sorting
   */
  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ limit: a[0].limit, offset: a[0].offset }),
  })
  async getBalances(params: {
    filter?: Record<string, any>;
    sort?: { [key: string]: SortOrder };
    limit?: number;
    offset?: number;
  }) {
    const filter = params.filter ?? {};
    setSpanAttributes({
      wallet: filter.wallet,
      userId: filter.userId,
      chainId: filter.chainId,
      blockNumber: filter.blockNumber,
      transactionHash: filter.transactionHash,
      poolAddress: filter.poolAddress,
    });

    const balances = await this.tokenBalanceRepository.findAll(params.filter, params.sort, params.limit, params.offset);

    return balances.map((b) => this.mapBalance(b));
  }

  /**
   * Gets transactions list with filters, pagination and sorting
   */
  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ limit: a[0].limit, offset: a[0].offset }),
  })
  async getTransactions(params: {
    filter?: Record<string, any>;
    sort?: { [key: string]: SortOrder };
    limit?: number;
    offset?: number;
  }) {
    const filter = params.filter ?? {};
    setSpanAttributes({
      wallet: filter.wallet ?? filter.from ?? filter.to,
      userId: filter.userId,
      chainId: filter.chainId,
      blockNumber: filter.blockNumber,
      transactionHash: filter.transactionHash,
      poolAddress: filter.poolAddress,
    });

    const transactions = await this.transactionRepository.findAll(
      params.filter,
      params.sort,
      params.limit,
      params.offset,
    );

    return transactions.map((tx) => this.mapTransaction(tx));
  }

  /**
   * Process RWA transfer event
   */
  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({
      from: a[0].data.from,
      to: a[0].data.to,
      tokenAddress: a[0].data.emittedFrom,
      tokenId: a[0].data.tokenId,
      poolAddress: a[0].data.pool,
      chainId: a[0].chainId,
      transactionHash: a[0].transactionHash,
      blockNumber: a[0].blockNumber,
      amount: a[0].data.amount,
    }),
  })
  async processTransfer(
    event: BlockchainEvent<{
      emittedFrom: string;
      from: string;
      to: string;
      tokenId: string;
      amount: string;
      pool: string;
    }>,
    commitInbox: () => Promise<void>,
  ) {
    setSpanAttributes({
      chainId: event.chainId,
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      poolAddress: event.data.pool,
    });

    await mongoose.connection.transaction(async () => {
      // Record transaction
      await this.transactionRepository.create({
        from: event.data.from,
        to: event.data.to,
        tokenAddress: event.data.emittedFrom,
        tokenId: event.data.tokenId,
        poolAddress: event.data.pool,
        chainId: event.chainId,
        transactionHash: event.transactionHash,
        logIndex: event.logIndex,
        blockNumber: event.blockNumber,
        amount: Number(event.data.amount),
      });

      if (event.data.from !== ZERO_ADDRESS) {
        await this.tokenBalanceRepository.updateBalance(
          event.data.from,
          event.data.emittedFrom,
          event.data.tokenId,
          event.data.pool,
          event.chainId,
          -Number(event.data.amount),
          event.blockNumber,
        );
      }

      if (event.data.to !== ZERO_ADDRESS) {
        await this.tokenBalanceRepository.updateBalance(
          event.data.to,
          event.data.emittedFrom,
          event.data.tokenId,
          event.data.pool,
          event.chainId,
          Number(event.data.amount),
          event.blockNumber,
        );
      }

      await commitInbox();
    });
  }

  private mapBalance(balance: ITokenBalanceEntity) {
    return {
      id: balance._id.toString(),
      owner: balance.owner,
      tokenAddress: balance.tokenAddress,
      tokenId: balance.tokenId,
      poolAddress: balance.poolAddress,
      chainId: balance.chainId,
      balance: balance.balance,
      lastUpdateBlock: balance.lastUpdateBlock,
      createdAt: balance.createdAt,
      updatedAt: balance.updatedAt,
    };
  }

  private mapTransaction(tx: ITransactionEntity) {
    return {
      id: tx._id.toString(),
      from: tx.from,
      to: tx.to,
      tokenAddress: tx.tokenAddress,
      poolAddress: tx.poolAddress,
      tokenId: tx.tokenId,
      chainId: tx.chainId,
      transactionHash: tx.transactionHash,
      logIndex: tx.logIndex,
      blockNumber: tx.blockNumber,
      amount: tx.amount,
      createdAt: tx.createdAt,
      updatedAt: tx.updatedAt,
    };
  }
}
