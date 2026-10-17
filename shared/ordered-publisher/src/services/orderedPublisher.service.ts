import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { metrics } from '@shared/monitoring/src/metrics';
import type { RabbitMQClient } from '@shared/rabbitmq/src/rabbitmq.client';
import type { OutboxMessageRepository } from '../repositories/outboxMessage.repository';


export class OrderedPublisherService {
  constructor(
    private readonly rabbitClient: RabbitMQClient,
    readonly exchange: string,
    private readonly outboxMessageRepository: OutboxMessageRepository,
  ) {}

  @TraceDecorator()
  async publish(routingKey: string, payload: unknown, messageId: string): Promise<void> {
    await this.outboxMessageRepository.create({
      routingKey,
      payload,
      messageId,
    });
    metrics.counter('ordered_publisher_queued_total', { exchange: this.exchange });
  }

  @TraceDecorator()
  async processOutbox(): Promise<void> {
    await this.outboxMessageRepository.releaseSending();

    while (true) {
      const message = await this.claimNext();
      if (!message) {
        return;
      }

      try {
        await this.rabbitClient.publish(this.exchange, message.routingKey, message.payload, {
          messageId: message.messageId,
        });
        await this.outboxMessageRepository.markSent(message._id);
        metrics.counter('ordered_publisher_published_total', { exchange: this.exchange });
      } catch (error) {
        // The message is never lost: it goes back to pending and the next pass retries it.
        logger.error(`Ordered publisher: outbox send failed; the message stays queued:`, error);
        await this.outboxMessageRepository.release(message._id).catch(() => undefined);
        return;
      }
    }
  }

  private async claimNext() {
    try {
      return await this.outboxMessageRepository.claimNext();
    } catch (error) {
      logger.error(`Ordered publisher: outbox claim failed:`, error);
      return null;
    }
  }
}
