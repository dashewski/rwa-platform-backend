import { AppError } from '@shared/errors/app-errors';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { metrics } from '@shared/monitoring/src/metrics';
import type { BaseRabbitMQClient } from '@shared/rabbitmq/src/baseRabbitmq.client';
import type { OutboxPublisherMessageRepository } from '../repositories/outboxPublisherMessage.repository';

export class OutboxPublisherService<TRabbitMQClient extends BaseRabbitMQClient = BaseRabbitMQClient> {
  constructor(
    public readonly rabbitClient: TRabbitMQClient,
    private readonly outboxPublisherMessageRepository: OutboxPublisherMessageRepository,
  ) {}

  @TraceDecorator()
  async publish(exchange: string, routingKey: string, payload: unknown, messageId: string): Promise<void> {
    if (!this.rabbitClient.isExchangeRegistered(exchange)) {
      throw new AppError({
        message: `Exchange "${exchange}" is not registered in the RabbitMQ client`,
        statusCode: 500,
        code: 'INTERNAL_ERROR',
      });
    }

    const created = await this.outboxPublisherMessageRepository.create({
      exchange,
      routingKey,
      payload,
      messageId,
    });

    if (created) {
      metrics.counter('outbox_publisher_queued_total', { exchange });
    }
  }

  @TraceDecorator()
  async processOutbox(exchange: string, isSync: boolean, concurrency: number, maxAttempts: number): Promise<void> {
    await this.outboxPublisherMessageRepository.releaseSending(exchange);

    const inFlight = new Set<Promise<boolean>>();

    while (true) {
      if (!isSync && inFlight.size >= concurrency) {
        await Promise.race(inFlight);
      }

      const message = await this.claimNext(exchange);
      if (!message) break;

      const sending = this.send(exchange, message, maxAttempts);

      if (isSync) {
        if (!(await sending)) break;
      } else {
        inFlight.add(sending);
        void sending.then(
          () => inFlight.delete(sending),
          () => inFlight.delete(sending),
        );
      }
    }

    await Promise.all(inFlight);
  }

  private async send(
    exchange: string,
    message: NonNullable<Awaited<ReturnType<OutboxPublisherMessageRepository['claimNext']>>>,
    maxAttempts: number,
  ): Promise<boolean> {
    try {
      await this.rabbitClient.publish(exchange, message.routingKey, message.payload, {
        messageId: message.messageId,
      });
      await this.outboxPublisherMessageRepository.markSent(message._id);
      metrics.counter('outbox_publisher_published_total', { exchange });

      return true;
    } catch (error) {
      logger.error(`Outbox publisher "${exchange}": outbox send failed; the next pass retries it:`, error);

      const failedAttempt = await this.outboxPublisherMessageRepository
        .markAttemptFailed(message._id, maxAttempts)
        .catch(() => null);

      if (failedAttempt?.status === 'failed') {
        metrics.counter('outbox_publisher_failed_total', { exchange });
        logger.error(
          `Outbox publisher "${exchange}": messageId "${message.messageId}" failed after ${failedAttempt.attempts} attempts; it is not retried anymore`,
        );

        return false;
      }

      return false;
    }
  }

  private async claimNext(exchange: string) {
    try {
      return await this.outboxPublisherMessageRepository.claimNext(exchange);
    } catch (error) {
      logger.error(`Outbox publisher "${exchange}": outbox claim failed:`, error);
      return null;
    }
  }
}
