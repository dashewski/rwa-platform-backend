import { AppError } from '@shared/errors/app-errors';
import { PoolTransactionRepository } from '../repositories/poolTransaction.repository';
import { PoolTransactionType } from '../models/shared/enums.model';
import type { SortOrder } from 'mongoose';
import { ChartEventsClient } from '../clients/redis.client';
import type { BlockchainEvent } from '@shared/blockchain';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import { MetricsDecorator } from '@shared/monitoring/src/metricsDecorator';
import { LogDecorator } from '@shared/monitoring/src/logDecorator';
import { setSpanAttributes } from '@shared/monitoring/src/tracing';

export class TransactionsService {
  constructor(
    private readonly poolTransactionRepository: PoolTransactionRepository,
    private readonly chartEventsClient: ChartEventsClient,
  ) {}

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({
      poolAddress: a[0].data.emittedFrom,
      transactionType: PoolTransactionType.MINT,
      userAddress: a[0].data.minter,
    }),
  })
  async recordMint(event: BlockchainEvent<{
    emittedFrom: string;
    minter: string;
    rwaAmountMinted: string;
    holdAmountPaid: string;
    feePaid: string;
  }>) {
    return await this.recordTransaction({
      poolAddress: event.data.emittedFrom,
      transactionType: PoolTransactionType.MINT,
      userAddress: event.data.minter,
      timestamp: event.timestamp,
      rwaAmount: event.data.rwaAmountMinted,
      holdAmount: event.data.holdAmountPaid,
      holdFee: event.data.feePaid,
    });
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({
      poolAddress: a[0].data.emittedFrom,
      transactionType: PoolTransactionType.BURN,
      userAddress: a[0].data.burner,
    }),
  })
  async recordBurn(event: BlockchainEvent<{
    emittedFrom: string;
    burner: string;
    rwaAmountBurned: string;
    holdAmountReceived: string;
    bonusAmountReceived: string;
    holdFeePaid: string;
    bonusFeePaid: string;
  }>) {
    return await this.recordTransaction({
      poolAddress: event.data.emittedFrom,
      transactionType: PoolTransactionType.BURN,
      userAddress: event.data.burner,
      timestamp: event.timestamp,
      rwaAmount: event.data.rwaAmountBurned,
      holdAmount: event.data.holdAmountReceived,
      bonusAmount: event.data.bonusAmountReceived,
      holdFee: event.data.holdFeePaid,
      bonusFee: event.data.bonusFeePaid,
    });
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({
      poolAddress: a[0].poolAddress,
      transactionType: a[0].transactionType,
      userAddress: a[0].userAddress,
    }),
  })
  private async recordTransaction(data: {
    poolAddress: string;
    transactionType: PoolTransactionType;
    userAddress: string;
    timestamp: number;
    rwaAmount: string;
    holdAmount: string;
    bonusAmount?: string;
    holdFee: string;
    bonusFee?: string;
  }) {
    setSpanAttributes({
      poolAddress: data.poolAddress,
      transactionType: data.transactionType,
      wallet: data.userAddress,
    });
    const transaction = await this.poolTransactionRepository.create({
      ...data,
      bonusAmount: data.bonusAmount || '0',
      bonusFee: data.bonusFee || '0',
    });

    const output = {
      id: transaction._id.toString(),
      poolAddress: transaction.poolAddress,
      transactionType: transaction.transactionType,
      userAddress: transaction.userAddress,
      timestamp: transaction.timestamp,
      rwaAmount: transaction.rwaAmount,
      holdAmount: transaction.holdAmount,
      bonusAmount: transaction.bonusAmount,
      holdFee: transaction.holdFee,
      bonusFee: transaction.bonusFee,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
    };

    await this.chartEventsClient.publishTransactionUpdate({
      poolAddress: output.poolAddress,
      timestamp: output.timestamp,
      transactionType: output.transactionType,
      userAddress: output.userAddress,
      rwaAmount: output.rwaAmount,
      holdAmount: output.holdAmount,
      bonusAmount: output.bonusAmount,
      holdFee: output.holdFee,
      bonusFee: output.bonusFee,
    });

    return output;
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ filter: a[0].filter, sort: a[0].sort }),
  })
  async getTransactions(params: {
    filter: Record<string, any>;
    sort?: { [key: string]: SortOrder };
    limit?: number;
    offset?: number;
  }) {
    const filter = params.filter ?? {};
    setSpanAttributes({
      poolAddress: filter.poolAddress,
      transactionType: filter.transactionType,
      wallet: filter.userAddress,
    });
    const transactions = await this.poolTransactionRepository.findAll(
      params.filter,
      params.sort,
      params.limit,
      params.offset,
    );

    return transactions.map((tx) => ({
      id: tx._id.toString(),
      poolAddress: tx.poolAddress,
      transactionType: tx.transactionType,
      userAddress: tx.userAddress,
      timestamp: tx.timestamp,
      rwaAmount: tx.rwaAmount,
      holdAmount: tx.holdAmount,
      bonusAmount: tx.bonusAmount,
      holdFee: tx.holdFee,
      bonusFee: tx.bonusFee,
      createdAt: tx.createdAt,
      updatedAt: tx.updatedAt,
    }));
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ 
      poolAddress: a[0].poolAddress, 
      interval: a[0].interval, 
      startTime: a[0].startTime, 
      endTime: a[0].endTime 
    }),
  })
  async getVolumeData(params: {
    poolAddress: string;
    interval: string;
    startTime: number;
    endTime: number;
    limit?: number;
  }) {
    setSpanAttributes({
      poolAddress: params.poolAddress,
      interval: params.interval,
    });

    const intervalMap: { [key: string]: number } = {
      '1m': 60,
      '5m': 300,
      '15m': 900,
      '30m': 1800,
      '1h': 3600,
      '2h': 7200,
      '4h': 14400,
      '6h': 21600,
      '12h': 43200,
      '1d': 86400,
      '1w': 604800,
    };

    const intervalSeconds = intervalMap[params.interval];
    if (!intervalSeconds) {
      throw new AppError({
        message: `Unsupported interval: ${params.interval}`,
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    }

    return await this.poolTransactionRepository.aggregateVolumeData(
      params.poolAddress,
      intervalSeconds,
      params.startTime,
      params.endTime,
      params.limit,
    );
  }
}
