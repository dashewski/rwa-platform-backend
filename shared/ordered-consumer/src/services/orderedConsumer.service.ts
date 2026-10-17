import type { ConsumeMessage } from 'amqplib';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { metrics } from '@shared/monitoring/src/metrics';
import type { ProcessedMessageRepository } from '../repositories/processedMessage.repository';


function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


export class OrderedConsumerService {
  private state: 'running' | 'halted' = 'running';

  constructor(
    readonly queueName: string,
    private readonly processedMessageRepository: ProcessedMessageRepository,
    private readonly maxAttempts: number = 3,
    private readonly initialDelayMs: number = 2_000,
    private readonly maxDelayMs: number = 15_000,
  ) {}

  status() {
    return {
      queue: this.queueName,
      state: this.state,
    };
  }

  @TraceDecorator()
  async handle(message: ConsumeMessage, handler: () => Promise<void>): Promise<'acked' | 'halted'> {
    // A delivery while halted means the broker redelivered the requeued message:
    // it is the head message — take it over and run the full attempt cycle again.
    if (this.state === 'halted') {
      logger.info(`Ordered consumer "${this.queueName}": retrying the halted message`);
    }

    let lastError = '';
    let delayMs = this.initialDelayMs;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const applied = await this.apply(message, handler);
        this.state = 'running';

        if (applied) {
          metrics.counter('ordered_consumer_processed_total', { queue: this.queueName });
        } else {
          metrics.counter('ordered_consumer_duplicates_total', { queue: this.queueName });
          logger.debug(`Ordered consumer "${this.queueName}": duplicate message skipped by the inbox`);
        }

        return 'acked';
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        metrics.counter('ordered_consumer_retries_total', { queue: this.queueName });
        logger.error(
          `Ordered consumer "${this.queueName}": attempt ${attempt}/${this.maxAttempts} failed` +
          `${attempt < this.maxAttempts ? `; retrying in ${delayMs}ms` : '; halting the stream'}`,
          error,
        );

        if (attempt < this.maxAttempts) {
          await delay(delayMs);
          delayMs = Math.min(delayMs * 2, this.maxDelayMs);
        }
      }
    }

    this.state = 'halted';
    metrics.counter('ordered_consumer_halted_total', { queue: this.queueName });
    logger.error(
      `Ordered consumer "${this.queueName}" HALTED: ${lastError}. The message is back at the head of the queue — ` +
      `fix the cause and the probe will bring the stream back.`,
    );

    return 'halted';
  }

  markProbed(): void {
    this.state = 'running';
    logger.info(`Ordered consumer "${this.queueName}": probed — resubscribed to the queue`);
  }

  private async apply(message: ConsumeMessage, handler: () => Promise<void>): Promise<boolean> {
    const messageId = message.properties?.messageId;

    if (!messageId) {
      throw new Error('the message has no messageId; the inbox cannot deduplicate it');
    }

    return await this.processedMessageRepository.runOnce(messageId, handler);
  }
}
