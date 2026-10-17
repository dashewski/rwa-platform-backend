import type { Types } from 'mongoose';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import { OutboxMessageEntity } from '../models/entity/outboxMessage.entity';
import type { IOutboxMessageEntity } from '../models/entity/outboxMessage.entity';

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export class OutboxMessageRepository {
  constructor(private readonly model = OutboxMessageEntity) {}

  @TraceDecorator()
  async create(data: Pick<IOutboxMessageEntity, 'routingKey' | 'payload' | 'messageId'>) {
    const doc = await this.model.create(data);
    return doc.toObject();
  }

  @TraceDecorator()
  async claimNext() {
    return await this.model
      .findOneAndUpdate(
        { status: 'pending' },
        { $set: { status: 'sending' } },
        { sort: { _id: 1 }, new: true },
      )
      .lean();
  }

  @TraceDecorator()
  async markSent(id: Types.ObjectId | string) {
    await this.model.updateOne({ _id: id }, { $set: { status: 'sent', sentAt: nowSeconds() } });
  }

  @TraceDecorator()
  async release(id: Types.ObjectId | string) {
    await this.model.updateOne({ _id: id }, { $set: { status: 'pending' } });
  }

  @TraceDecorator()
  async releaseSending() {
    await this.model.updateMany({ status: 'sending' }, { $set: { status: 'pending' } });
  }
}
