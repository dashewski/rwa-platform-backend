import type { Types } from 'mongoose';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import { OutboxPublisherMessageEntity } from '../models/entity/outboxPublisherMessage.entity';
import type { IOutboxPublisherMessageEntity } from '../models/entity/outboxPublisherMessage.entity';

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export class OutboxPublisherMessageRepository {
  constructor(private readonly model = OutboxPublisherMessageEntity) {}

  @TraceDecorator()
  async create(data: Pick<IOutboxPublisherMessageEntity, 'exchange' | 'routingKey' | 'payload' | 'messageId'>) {
    try {
      const doc = await this.model.create(data);
      return doc.toObject();
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        return null;
      }

      throw error;
    }
  }

  @TraceDecorator()
  async claimNext(exchange: string) {
    return await this.model
      .findOneAndUpdate(
        { status: 'pending', exchange },
        { $set: { status: 'sending' } },
        { sort: { _id: 1 }, new: true },
      )
      .lean();
  }

  @TraceDecorator()
  async markSent(id: Types.ObjectId | string) {
    await this.model.updateOne(
      { _id: id },
      {
        $set: {
          status: 'sent',
          sentAt: nowSeconds(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      },
    );
  }

  @TraceDecorator()
  async markAttemptFailed(id: Types.ObjectId | string, maxAttempts: number) {
    return await this.model
      .findOneAndUpdate(
        { _id: id },
        [
          { $set: { attempts: { $add: ['$attempts', 1] } } },
          { $set: { status: { $cond: [{ $gte: ['$attempts', maxAttempts] }, 'failed', 'sending'] } } },
        ],
        { new: true },
      )
      .lean();
  }

  @TraceDecorator()
  async releaseSending(exchange: string) {
    await this.model.updateMany({ status: 'sending', exchange }, { $set: { status: 'pending' } });
  }
}
