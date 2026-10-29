import { PriceDataRepository } from '../repositories/priceData.repository';
import type { IPriceDataEntity } from '../models/entity/priceData.entity';
import mongoose from 'mongoose';
import type { SortOrder } from 'mongoose';
import { AppError } from '@shared/errors/app-errors';
import { ChartEventsClient } from '../clients/redis.client';
import type { BlockchainEvent } from '@shared/blockchain';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import { MetricsDecorator } from '@shared/monitoring/src/metricsDecorator';
import { setSpanAttributes } from '@shared/monitoring/src/tracing';
import { LogDecorator } from '@shared/monitoring/src/logDecorator';

export type OhlcInterval = '1m' | '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '6h' | '12h' | '1d' | '1w';

export class ChartsService {
  constructor(
    private readonly priceDataRepository: PriceDataRepository,
    private readonly chartEventsClient: ChartEventsClient,
  ) {
    mongoose.set('transactionAsyncLocalStorage', true);
  }

  private mapPriceDataToOutput(doc: IPriceDataEntity): Omit<IPriceDataEntity, '_id'> & { id: string } {
    return {
      id: doc._id.toString(),
      poolAddress: doc.poolAddress,
      timestamp: doc.timestamp,
      blockNumber: doc.blockNumber,
      realHoldReserve: doc.realHoldReserve,
      virtualHoldReserve: doc.virtualHoldReserve,
      virtualRwaReserve: doc.virtualRwaReserve,
      price: doc.price,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({
      poolAddress: a[0].data.emittedFrom,
      timestamp: a[0].timestamp,
      blockNumber: a[0].blockNumber,
    }),
  })
  async recordPriceData(
    event: BlockchainEvent<{
      emittedFrom: string;
      realHoldReserve: string;
      virtualHoldReserve: string;
      virtualRwaReserve: string;
    }>,
    commitInbox: () => Promise<void>,
  ): Promise<Omit<IPriceDataEntity, '_id'> & { id: string }> {
    const data = {
      poolAddress: event.data.emittedFrom,
      timestamp: event.timestamp,
      blockNumber: event.blockNumber,
      realHoldReserve: event.data.realHoldReserve,
      virtualHoldReserve: event.data.virtualHoldReserve,
      virtualRwaReserve: event.data.virtualRwaReserve,
    };

    setSpanAttributes({
      poolAddress: data.poolAddress,
      blockNumber: data.blockNumber,
    });
    const virtualRwaReserveBigInt = BigInt(data.virtualRwaReserve);
    if (virtualRwaReserveBigInt === 0n) {
      throw new AppError({
        message: 'virtualRwaReserve cannot be zero for price calculation.',
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    }

    const virtualHoldReserveBigInt = BigInt(data.virtualHoldReserve);
    const realHoldReserveBigInt = BigInt(data.realHoldReserve);

    const numerator = virtualHoldReserveBigInt + realHoldReserveBigInt;
    const calculatedPriceBigInt = numerator / virtualRwaReserveBigInt;
    const priceString = calculatedPriceBigInt.toString();

    const newPriceEntry: Omit<IPriceDataEntity, '_id' | 'createdAt' | 'updatedAt'> = {
      poolAddress: data.poolAddress,
      timestamp: data.timestamp,
      blockNumber: data.blockNumber,
      realHoldReserve: data.realHoldReserve,
      virtualHoldReserve: data.virtualHoldReserve,
      virtualRwaReserve: data.virtualRwaReserve,
      price: priceString,
    };

    const createdDoc = await mongoose.connection.transaction(async () => {
      const doc = await this.priceDataRepository.create(newPriceEntry);

      await commitInbox();

      return doc;
    });
    const output = this.mapPriceDataToOutput(createdDoc);

    await this.chartEventsClient.publishPriceUpdate({
      poolAddress: output.poolAddress,
      timestamp: output.timestamp,
      price: output.price,
      realHoldReserve: output.realHoldReserve,
      virtualHoldReserve: output.virtualHoldReserve,
      virtualRwaReserve: output.virtualRwaReserve,
    });

    return output;
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({
      poolAddress: a[0].poolAddress,
      startTime: a[0].startTime,
      endTime: a[0].endTime,
    }),
  })
  async getRawPriceData(params: {
    poolAddress: string;
    startTime: number;
    endTime: number;
    limit?: number;
    offset?: number;
    sort?: { [key: string]: SortOrder };
  }): Promise<(Omit<IPriceDataEntity, '_id'> & { id: string })[]> {
    setSpanAttributes({
      poolAddress: params.poolAddress,
    });
    const { poolAddress, startTime, endTime, limit, offset, sort } = params;

    const docs = await this.priceDataRepository.findByPoolAndTimeRange(
      poolAddress,
      startTime,
      endTime,
      sort,
      limit,
      offset,
    );
    return docs.map((d) => this.mapPriceDataToOutput(d));
  }

  private getMillisecondsForInterval(interval: OhlcInterval): number {
    switch (interval) {
      case '1m':
        return 60 * 1000;
      case '5m':
        return 5 * 60 * 1000;
      case '15m':
        return 15 * 60 * 1000;
      case '30m':
        return 30 * 60 * 1000;
      case '1h':
        return 60 * 60 * 1000;
      case '2h':
        return 2 * 60 * 60 * 1000;
      case '4h':
        return 4 * 60 * 60 * 1000;
      case '6h':
        return 6 * 60 * 60 * 1000;
      case '12h':
        return 12 * 60 * 60 * 1000;
      case '1d':
        return 24 * 60 * 60 * 1000;
      case '1w':
        return 7 * 24 * 60 * 60 * 1000;
      default:
        throw new AppError({
          message: `Unsupported interval: ${interval}`,
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
    }
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({
      poolAddress: a[0].poolAddress,
      interval: a[0].interval,
      startTime: a[0].startTime,
      endTime: a[0].endTime,
    }),
  })
  async getOhlcPriceData(params: {
    poolAddress: string;
    interval: OhlcInterval;
    startTime: number;
    endTime: number;
    limit?: number;
  }): Promise<
    {
      timestamp: number;
      open: string;
      high: string;
      low: string;
      close: string;
    }[]
  > {
    setSpanAttributes({
      poolAddress: params.poolAddress,
      interval: params.interval,
    });
    const { poolAddress, interval, startTime, endTime, limit } = params;

    const intervalMs = this.getMillisecondsForInterval(interval);
    const intervalSeconds = intervalMs / 1000;

    const results = await this.priceDataRepository.aggregateOhlcData(
      poolAddress,
      intervalSeconds,
      startTime,
      endTime,
      limit,
    );

    return results.map((bar) => ({
      timestamp: bar.timestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    }));
  }
}
