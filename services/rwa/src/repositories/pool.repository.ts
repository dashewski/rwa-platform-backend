import { AppError } from '@shared/errors/app-errors';
import type { FilterQuery, SortOrder } from 'mongoose';
import { PoolEntity } from '../models/entity/pool.entity';
import type { IPoolEntity } from '../models/entity/pool.entity';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';

export class PoolRepository {
  constructor(private readonly model = PoolEntity) {}

  @TraceDecorator()
  async createPool(
    data: Pick<IPoolEntity, 'ownerId' | 'ownerType' | 'name' | 'chainId' | 'businessId' | 'rwaAddress'> &
      Partial<
        Pick<
          IPoolEntity,
          | 'entryFeePercent'
          | 'exitFeePercent'
          | 'expectedHoldAmount'
          | 'expectedRwaAmount'
          | 'rewardPercent'
          | 'entryPeriodStart'
          | 'entryPeriodExpired'
          | 'completionPeriodExpired'
          | 'awaitCompletionExpired'
          | 'floatingOutTranchesTimestamps'
          | 'fixedSell'
          | 'allowEntryBurn'
          | 'priceImpactPercent'
          | 'outgoingTranches'
          | 'incomingTranches'
          | 'description'
          | 'tags'
          | 'image'
          | 'fileId'
        >
      >,
  ) {
    const doc = await this.model.create(data);
    return doc.toObject();
  }

  @TraceDecorator()
  async updatePool(
    id: string,
    data: Partial<
      Pick<
        IPoolEntity,
        | 'chainId'
        | 'ownerWallet'
        | 'name'
        | 'poolAddress'
        | 'tokenId'
        | 'holdToken'
        | 'entryFeePercent'
        | 'exitFeePercent'
        | 'expectedHoldAmount'
        | 'expectedRwaAmount'
        | 'expectedBonusAmount'
        | 'rewardPercent'
        | 'entryPeriodStart'
        | 'entryPeriodExpired'
        | 'completionPeriodExpired'
        | 'awaitCompletionExpired'
        | 'floatingOutTranchesTimestamps'
        | 'fixedSell'
        | 'allowEntryBurn'
        | 'priceImpactPercent'
        | 'liquidityCoefficient'
        | 'k'
        | 'realHoldReserve'
        | 'virtualHoldReserve'
        | 'virtualRwaReserve'
        | 'floatingTimestampOffset'
        | 'isTargetReached'
        | 'isFullyReturned'
        | 'fullReturnTimestamp'
        | 'totalClaimedAmount'
        | 'totalReturnedAmount'
        | 'awaitingBonusAmount'
        | 'awaitingRwaAmount'
        | 'outgoingTranchesBalance'
        | 'outgoingTranches'
        | 'incomingTranches'
        | 'lastCompletedIncomingTranche'
        | 'paused'
        | 'description'
        | 'tags'
        | 'riskScore'
        | 'approvalSignaturesTaskId'
        | 'approvalSignaturesTaskExpired'


        | 'image'
        | 'fileId'
      >
    >,
  ) {
    const doc = await this.model.findByIdAndUpdate(id, data, { new: true }).lean();

    if (!doc) {
      throw new AppError({ message: `Pool ${id} not found`, statusCode: 404, code: 'NOT_FOUND' });
    }

    return doc;
  }

  @TraceDecorator()
  async findById(id: string) {
    const doc = await this.model.findById(id).lean();

    if (!doc) {
      throw new AppError({ message: `Pool ${id} not found`, statusCode: 404, code: 'NOT_FOUND' });
    }

    return doc;
  }

  @TraceDecorator()
  async findAll(
    filter: FilterQuery<typeof this.model> = {},
    sort: { [key: string]: SortOrder } = { createdAt: 'asc' },
    limit: number = 100,
    offset: number = 0,
  ) {
    return await this.model.find(filter).sort(sort).skip(offset).limit(limit).lean();
  }

  @TraceDecorator()
  async updatePoolByAddress(
    poolAddress: string,
    data: Partial<
      Pick<
        IPoolEntity,
        | 'realHoldReserve'
        | 'virtualHoldReserve'
        | 'virtualRwaReserve'
        | 'awaitingRwaAmount'
        | 'awaitingBonusAmount'
        | 'isFullyReturned'
        | 'fullReturnTimestamp'
        | 'totalReturnedAmount'
        | 'lastCompletedIncomingTranche'
        | 'totalClaimedAmount'
        | 'outgoingTranchesBalance'
        | 'outgoingTranches'
        | 'incomingTranches'
        | 'paused'
        | 'isTargetReached'
        | 'floatingTimestampOffset'
        | 'rewardedRwaAmount'
      >
    >,
  ) {
    const doc = await this.model.findOneAndUpdate({ poolAddress }, data, { new: true }).lean();

    if (!doc) {
      throw new AppError({
        message: `Pool with address ${poolAddress} not found`,
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    }

    return doc;
  }

  @TraceDecorator()
  async findByRwaAddressAndTokenId(rwaAddress: string, tokenId: string) {
    const doc = await this.model.findOne({ rwaAddress, tokenId }).lean();

    if (!doc) {
      throw new AppError({
        message: `Pool with rwaAddress ${rwaAddress} and tokenId ${tokenId} not found`,
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    }

    return doc;
  }

  @TraceDecorator()
  async findByAddress(poolAddress: string) {
    const doc = await this.model.findOne({ poolAddress }).lean();

    if (!doc) {
      throw new AppError({
        message: `Pool with address ${poolAddress} not found`,
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    }

    return doc;
  }
}
