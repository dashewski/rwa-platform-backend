import { AppError } from '@shared/errors/app-errors';
import type { FilterQuery, SortOrder } from 'mongoose';
import { MessageEntity } from '../models/entity/message.entity';
import type { IMessageEntity } from '../models/entity/message.entity';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';

export class MessageRepository {
  constructor(private readonly model = MessageEntity) {}

  @TraceDecorator()
  async create(data: Pick<IMessageEntity, 'assistantId' | 'text' | 'sender'>) {
    const doc = await this.model.create(data);
    return doc.toObject();
  }

  @TraceDecorator()
  async update(id: string, data: Pick<IMessageEntity, 'text'>) {
    const doc = await this.model.findByIdAndUpdate(id, data, { new: true }).lean();

    if (!doc) {
      throw new AppError({
        message: `Message ${id} not found`,
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    }

    return doc;
  }

  @TraceDecorator()
  async delete(id: string) {
    const doc = await this.model.findByIdAndDelete(id).lean();

    if (!doc) {
      throw new AppError({
        message: `Message ${id} not found`,
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    }

    return id;
  }

  @TraceDecorator()
  async findById(id: string) {
    const doc = await this.model.findById(id).lean();

    if (!doc) {
      throw new AppError({
        message: `Message ${id} not found`,
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    }

    return doc;
  }

  @TraceDecorator()
  async findByAssistantId(
    assistantId: string,
    sort: { [key: string]: SortOrder } = { createdAt: 'asc' },
    limit: number = 100,
    offset: number = 0,
  ) {
    const docs = await this.model.find({ assistantId }).sort(sort).skip(offset).limit(limit).lean();

    return docs;
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
}
