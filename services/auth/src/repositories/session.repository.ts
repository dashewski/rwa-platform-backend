import { SessionEntity } from '../models/entity/session.entity';
import type { Types } from 'mongoose';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';

export class SessionRepository {
  constructor(private readonly model = SessionEntity) {}

  @TraceDecorator()
  async create(userId: string, sessionKey: string, jti: string, expiresAt: number) {
    try {
      return await this.model.create({
        userId,
        sessionKey,
        jti,
        expiresAt,
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        return null;
      }

      throw error;
    }
  }

  @TraceDecorator()
  async findBySessionKey(sessionKey: string) {
    return await this.model.findOne({ sessionKey }).lean();
  }

  @TraceDecorator()
  async rotate(sessionKey: string, jti: string, newJti: string, expiresAt: number) {
    const now = Math.floor(Date.now() / 1000);

    return await this.model
      .findOneAndUpdate(
        { sessionKey, jti, expiresAt: { $gt: now } },
        { $set: { jti: newJti, expiresAt } },
        { new: true },
      )
      .lean();
  }

  @TraceDecorator()
  async deleteBySessionKey(sessionKey: string) {
    const result = await this.model.deleteOne({ sessionKey });

    return result.deletedCount;
  }

  @TraceDecorator()
  async deleteByUserId(userId: string | Types.ObjectId) {
    const result = await this.model.deleteMany({ userId });

    return result.deletedCount;
  }

}
