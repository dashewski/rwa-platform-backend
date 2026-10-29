import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import type { InboxConsumerMessageRepository } from '../repositories/inboxConsumerMessage.repository';

export class InboxConsumerService {
  constructor(private readonly inboxConsumerMessageRepository: InboxConsumerMessageRepository) {}

  @TraceDecorator()
  async isCommitted(messageId: string): Promise<boolean> {
    return this.inboxConsumerMessageRepository.exists(messageId);
  }

  @TraceDecorator()
  async commit(messageId: string): Promise<void> {
    await this.inboxConsumerMessageRepository.create(messageId);
  }
}
