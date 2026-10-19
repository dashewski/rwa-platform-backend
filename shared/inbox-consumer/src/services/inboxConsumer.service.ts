import type { ConsumeMessage } from 'amqplib';
import mongoose from 'mongoose';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { metrics } from '@shared/monitoring/src/metrics';
import type { InboxConsumerMessageRepository } from '../repositories/inboxConsumerMessage.repository';

export class InboxConsumerService {
  constructor(
    private readonly inboxConsumerMessageRepository: InboxConsumerMessageRepository,
    private readonly initialDelayMs: number = 500,
    private readonly maxDelayMs: number = 30_000,
  ) {
    mongoose.set('transactionAsyncLocalStorage', true);
  }

  @TraceDecorator()
  async handle(
    queueName: string,
    message: ConsumeMessage,
    handler: () => Promise<void>,
    maxAttempts: number = Number.POSITIVE_INFINITY,
  ): Promise<'acked' | 'deferred'> {
    let lastError = '';
    let delayMs = this.initialDelayMs;
    let attempt = 1;
    for (; attempt <= maxAttempts; attempt += 1) {
      try {
        const applied = await this.apply(message, handler);

        if (applied) {
          metrics.counter('inbox_consumer_processed_total', { queue: queueName });
        } else {
          metrics.counter('inbox_consumer_duplicates_total', { queue: queueName });
          logger.debug(`Inbox consumer "${queueName}": duplicate message skipped by the inbox`);
        }

        return 'acked';
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        metrics.counter('inbox_consumer_retries_total', { queue: queueName });

        const givingUp = attempt >= maxAttempts;
        logger.error(
          `Inbox consumer "${queueName}": attempt ${attempt}${Number.isFinite(maxAttempts) ? `/${maxAttempts}` : ''} failed` +
            `${givingUp ? '; handing the message to the retry queue' : `; retrying in ${delayMs}ms`}`,
          error,
        );

        if (givingUp) break;

        await new Promise((r) => setTimeout(r, delayMs));
        delayMs = Math.min(delayMs * 2, this.maxDelayMs);
      }
    }

    metrics.counter('inbox_consumer_deferred_total', { queue: queueName });
    logger.error(
      `Inbox consumer "${queueName}": attempts exhausted (${attempt}) — the message goes to the retry queue; ` +
        `last error: ${lastError}`,
    );

    return 'deferred';
  }

  private async apply(message: ConsumeMessage, handler: () => Promise<void>): Promise<boolean> {
    const messageId = message.properties?.messageId;

    if (!messageId) {
      throw new Error('the message has no messageId; the inbox cannot deduplicate it');
    }

    return await mongoose.connection.transaction(async () => {
      const created = await this.inboxConsumerMessageRepository.create(messageId);

      if (!created) {
        return false;
      }

      await handler();

      return true;
    });
  }
}
