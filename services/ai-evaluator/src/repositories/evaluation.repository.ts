import { AppError } from '@shared/errors/app-errors';
import type { FilterQuery, SortOrder } from 'mongoose';
import { EvaluationEntity } from '../models/entity/evaluation.entity';
import type { IEvaluationEntity } from '../models/entity/evaluation.entity';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';

export class EvaluationRepository {
  constructor(private readonly model = EvaluationEntity) {}

  @TraceDecorator()
  async create(data: Pick<IEvaluationEntity, 'entityType' | 'parentId'>) {
    const doc = await this.model.create(data);
    return doc.toObject();
  }

  @TraceDecorator()
  async fillContext(
    id: string,
    data: {
      text: string;
      files: Array<{ id: string; name: string; mimeType: string; url: string }>;
      ownerId: string;
      ownerType: string;
      grandParentId: string;
    },
  ) {
    return await this.model
      .findOneAndUpdate(
        { _id: id, context: null },
        {
          $set: {
            context: { text: data.text, files: data.files },
            ownerId: data.ownerId,
            ownerType: data.ownerType,
            grandParentId: data.grandParentId,
          },
        },
        { new: true },
      )
      .lean();
  }

  @TraceDecorator()
  async fillSelection(id: string, files: Array<{ id: string; name: string; mimeType: string; url: string }>) {
    return await this.model
      .findOneAndUpdate({ _id: id, selection: null }, { $set: { selection: { files } } }, { new: true })
      .lean();
  }

  @TraceDecorator()
  async fillSummary(id: string, summary: string) {
    return await this.model.findOneAndUpdate({ _id: id, summary: null }, { $set: { summary } }, { new: true }).lean();
  }

  @TraceDecorator()
  async fillRisk(id: string, risk: { score: number; pros: string[]; cons: string[] }) {
    return await this.model.findOneAndUpdate({ _id: id, 'risk.score': null }, { $set: { risk } }, { new: true }).lean();
  }

  @TraceDecorator()
  async finalize(
    id: string,
    data: {
      sources: Array<{ type: string; id: string; name: string; mimeType: string }>;
      modelUsed: string;
    },
  ) {
    return await this.model
      .findOneAndUpdate(
        { _id: id, completed: false },
        { $set: { sources: data.sources, modelUsed: data.modelUsed, completed: true } },
        { new: true },
      )
      .lean();
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
