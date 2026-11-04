import { AppError } from '@shared/errors/app-errors';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import { EvaluationJobEntity } from '../models/entity/evaluationJob.entity';
import type { IEvaluationJobEntity } from '../models/entity/evaluationJob.entity';

export class EvaluationJobRepository {
  private readonly model = EvaluationJobEntity;

  @TraceDecorator()
  async create(data: Omit<IEvaluationJobEntity, '_id' | 'createdAt' | 'updatedAt' | 'ttlDate'>) {
    return await this.model.create(data);
  }

  @TraceDecorator()
  async claimNext(lockMs: number) {
    return await this.model
      .findOneAndUpdate(
        {
          status: { $in: ['pending', 'running'] },
          lockedUntil: { $not: { $gt: new Date() } },
        },
        {
          $set: {
            status: 'running',
            lockedUntil: new Date(Date.now() + lockMs),
          },
          $inc: { attempts: 1 },
        },
        { sort: { createdAt: 1 }, new: true },
      )
      .lean();
  }

  @TraceDecorator()
  async complete(id: string) {
    return await this.model
      .findOneAndUpdate({ _id: id }, { $set: { status: 'completed', error: undefined } }, { new: true })
      .lean();
  }

  @TraceDecorator()
  async release(id: string, retryDelayMs: number, error: string) {
    return await this.model
      .findOneAndUpdate(
        { _id: id },
        { $set: { status: 'pending', error, lockedUntil: new Date(Date.now() + retryDelayMs) } },
        { new: true },
      )
      .lean();
  }

  @TraceDecorator()
  async fail(id: string, error: string) {
    const job = await this.model
      .findOneAndUpdate({ _id: id }, { $set: { status: 'failed', error } }, { new: true })
      .lean();

    if (!job) {
      throw new AppError({
        message: `Evaluation job ${id} not found`,
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    }

    return job;
  }
}
