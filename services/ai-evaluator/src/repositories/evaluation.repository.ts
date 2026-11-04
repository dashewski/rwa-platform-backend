import { AppError } from '@shared/errors/app-errors';
import type { FilterQuery, SortOrder, Types } from 'mongoose';
import { EvaluationEntity } from '../models/entity/evaluation.entity';
import type { IEvaluationEntity } from '../models/entity/evaluation.entity';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';

export class EvaluationRepository {
  constructor(private readonly model = EvaluationEntity) {}

  @TraceDecorator()
  async create(data: Omit<IEvaluationEntity, '_id' | 'createdAt' | 'updatedAt'> & { _id?: Types.ObjectId }) {
    const doc = await this.model.create(data);
    return doc.toObject();
  }

  @TraceDecorator()
  async updateById(id: string, data: Partial<IEvaluationEntity>) {
    const doc = await this.model.findByIdAndUpdate(id, data, { new: true }).lean();
    if (!doc) {
      throw new AppError({
        message: `Evaluation ${id} not found`,
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
        message: `Evaluation ${id} not found`,
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
