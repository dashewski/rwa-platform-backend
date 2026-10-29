import { AppError } from '@shared/errors/app-errors';
import type { FilterQuery, SortOrder } from 'mongoose';
import { SignatureTask } from '../models/entity/signatureTask.entity';
import type { ISignatureTask } from '../models/entity/signatureTask.entity';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';

export class SignatureTaskRepository {
  constructor(private readonly model = SignatureTask) {}

  @TraceDecorator()
  async create(data: Pick<ISignatureTask, 'ownerId' | 'ownerType' | 'hash' | 'requiredSignatures' | 'expired'>) {
    const doc = await this.model.create(data);
    return doc.toObject();
  }

  @TraceDecorator()
  async findById(id: string) {
    const doc = await this.model.findById(id).lean();

    if (!doc) {
      throw new AppError({
        message: `SignatureTask ${id} not found`,
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    }

    return doc;
  }

  @TraceDecorator()
  async findByHash(hash: string) {
    const doc = await this.model.findOne({ hash }).lean();

    if (!doc) {
      throw new AppError({
        message: `SignatureTask with hash ${hash} not found`,
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    }

    return doc;
  }

  @TraceDecorator()
  async findAll(
    filters: FilterQuery<typeof this.model> = {},
    sort: { [key: string]: SortOrder } = { createdAt: 'asc' },
    limit: number = 100,
    offset: number = 0,
  ) {
    const docs = await this.model.find(filters).sort(sort).skip(offset).limit(limit).lean();

    return docs;
  }

  @TraceDecorator()
  async findActive() {
    const now = Math.floor(Date.now() / 1000);
    return this.findAll({
      $or: [{ expired: { $gt: now } }, { expired: { $exists: false } }],
    });
  }
}
