import { AppError } from '@shared/errors/app-errors';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import { EvaluationLockEntity } from '../models/entity/evaluationLock.entity';
import type { IEvaluationLockEntity } from '../models/entity/evaluationLock.entity';

export class EvaluationLockRepository {
  constructor(private readonly model = EvaluationLockEntity) {}

  @TraceDecorator()
  async acquire(
    entityType: IEvaluationLockEntity['entityType'],
    parentId: string,
    cooldownSeconds: number,
  ) {
    const now = Math.floor(Date.now() / 1000);

    try {
      await this.model.updateOne(
        { entityType, parentId, cooldownUntil: { $lte: now } },
        { $set: { cooldownUntil: now + cooldownSeconds } },
        { upsert: true },
      );
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        throw new AppError({
          message: `Evaluation cooldown is active for ${entityType} ${parentId}`,
          statusCode: 429,
          code: 'EVALUATION_COOLDOWN',
        });
      }

      throw error;
    }
  }
}
