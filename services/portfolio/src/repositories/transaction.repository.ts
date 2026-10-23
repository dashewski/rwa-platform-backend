import { AppError } from '@shared/errors/app-errors';
import type { FilterQuery, SortOrder } from 'mongoose';
import { TransactionEntity } from '../models/entity/transaction.entity';
import type { ITransactionEntity } from '../models/entity/transaction.entity';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';

export class TransactionRepository {
  constructor(private readonly model = TransactionEntity) {}

  @TraceDecorator()
  async create(
    data: Pick<
      ITransactionEntity,
      | 'from'
      | 'to'
      | 'tokenAddress'
      | 'tokenId'
      | 'poolAddress'
      | 'chainId'
      | 'transactionHash'
      | 'logIndex'
      | 'blockNumber'
      | 'amount'
    >,
  ) {
    const transaction = await this.model.create(data);
    return transaction.toObject();
  }

  @TraceDecorator()
  async findById(id: string) {
    const transaction = await this.model.findById(id).lean();

    if (!transaction) {
      throw new AppError({
        message: `Transaction ${id} not found`,
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    }

    return transaction;
  }

  @TraceDecorator()
  async findAll(
    filter: FilterQuery<typeof this.model> = {},
    sort: { [key: string]: SortOrder } = { blockNumber: 'asc' },
    limit: number = 100,
    offset: number = 0,
  ) {
    return await this.model.find(filter).sort(sort).skip(offset).limit(limit).lean();
  }
}
