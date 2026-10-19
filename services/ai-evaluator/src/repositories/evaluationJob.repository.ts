import type { Types } from 'mongoose';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import { EvaluationJobEntity } from '../models/entity/evaluationJob.entity';

export class EvaluationJobRepository {
  constructor(private readonly model = EvaluationJobEntity) {}

  @TraceDecorator()
  async create(params: { entityType: 'pool' | 'business'; entityId: string; params: object }) {
    return await this.model.create({ ...params, status: 'pending', attempts: 0 });
  }

  @TraceDecorator()
  async releaseProcessing() {
    await this.model.updateMany({ status: 'processing' }, { status: 'pending' });
  }

  @TraceDecorator()
  async claimNext() {
    return await this.model
      .findOneAndUpdate({ status: 'pending' }, { status: 'processing' }, { sort: { _id: 1 }, new: true })
      .lean();
  }

  @TraceDecorator()
  async markDone(id: Types.ObjectId | string) {
    await this.model.updateOne({ _id: id }, { status: 'done' });
  }

  @TraceDecorator()
  async markAttemptFailed(id: Types.ObjectId | string, maxAttempts: number) {
    return await this.model
      .findOneAndUpdate(
        { _id: id },
        [
          { $set: { attempts: { $add: ['$attempts', 1] } } },
          { $set: { status: { $cond: [{ $gte: ['$attempts', maxAttempts] }, 'failed', 'pending'] } } },
        ],
        { new: true },
      )
      .lean();
  }
}
