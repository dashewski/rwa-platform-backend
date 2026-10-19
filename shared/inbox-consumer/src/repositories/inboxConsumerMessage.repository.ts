import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import { InboxConsumerMessageEntity } from '../models/entity/inboxConsumerMessage.entity';

export class InboxConsumerMessageRepository {
  constructor(private readonly model = InboxConsumerMessageEntity) {}

  @TraceDecorator()
  async create(messageId: string): Promise<boolean> {
    try {
      await this.model.create({ messageId });

      return true;
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        return false;
      }

      throw error;
    }
  }
}
