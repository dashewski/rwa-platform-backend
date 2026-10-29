import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import { InboxConsumerMessageEntity } from '../models/entity/inboxConsumerMessage.entity';

export class InboxConsumerMessageRepository {
  constructor(private readonly model = InboxConsumerMessageEntity) {}

  @TraceDecorator()
  async create(messageId: string): Promise<void> {
    await this.model.create({ messageId });
  }

  @TraceDecorator()
  async exists(messageId: string): Promise<boolean> {
    return await this.model.exists({ messageId }) !== null;
  }
}
