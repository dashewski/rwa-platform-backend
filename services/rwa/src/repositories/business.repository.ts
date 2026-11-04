import { AppError } from '@shared/errors/app-errors';
import type { FilterQuery, SortOrder } from 'mongoose';
import { BusinessEntity } from '../models/entity/business.entity';
import type { IBusinessEntity } from '../models/entity/business.entity';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';

export class BusinessRepository {
  constructor(private readonly model = BusinessEntity) {}

  @TraceDecorator()
  async createBusiness(
    data: Pick<IBusinessEntity, 'ownerId' | 'ownerType' | 'name' | 'chainId'> &
      Partial<
        Pick<IBusinessEntity, 'description' | 'tags' | 'image' | 'fileId' | 'country' | 'businessType' | 'socials'>
      >,
  ) {
    const doc = await this.model.create(data);
    return doc.toObject();
  }

  @TraceDecorator()
  async updateBusiness(
    id: string,
    data: Partial<
      Pick<
        IBusinessEntity,
        | 'chainId'
        | 'ownerWallet'
        | 'name'
        | 'tokenAddress'
        | 'description'
        | 'tags'
        | 'image'
        | 'fileId'
        | 'riskScore'
        | 'approvalSignaturesTaskId'
        | 'approvalSignaturesTaskExpired'


        | 'country'
        | 'businessType'
        | 'socials'
        | 'paused'
      >
    >,
  ) {
    const doc = await this.model.findByIdAndUpdate(id, data, { new: true }).lean();

    if (!doc) {
      throw new AppError({
        message: `Business ${id} not found`,
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    }

    return doc;
  }

  @TraceDecorator()
  async updateBusinessByTokenAddress(tokenAddress: string, data: Partial<Pick<IBusinessEntity, 'paused'>>) {
    const doc = await this.model.findOneAndUpdate({ tokenAddress }, data, { new: true }).lean();

    if (!doc) {
      throw new AppError({
        message: `Business with token address ${tokenAddress} not found`,
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    }

    return doc;
  }

  @TraceDecorator()
  async findById(id: string) {
    const doc = await this.model.findById(id).lean();

    if (!doc) {
      throw new AppError({
        message: `Business ${id} not found`,
        statusCode: 404,
        code: 'NOT_FOUND',
      });
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
}
