import type { ConsumeMessage } from 'amqplib';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { metrics } from '@shared/monitoring/src/metrics';
import type { BaseRabbitMQClient } from '@shared/rabbitmq/src/baseRabbitmq.client';
import type { InboxConsumerService } from '../services/inboxConsumer.service';


export abstract class BaseInboxConsumerDaemon {
  private readonly consumerTags = new Map<string, string>();
  private readonly processingChains = new Map<string, Promise<void>>();

  constructor(
    private readonly rabbitClient: BaseRabbitMQClient,
    private readonly consumerService: InboxConsumerService,
    private readonly eventRouting: Record<
      string,
      {
        prefetch: number;
        isSync: boolean;
        handlers: Record<string, (event: any, commitInbox: () => Promise<void>) => Promise<void>>;
      }
    >,
    private readonly initialDelayMs: number = 500,
    private readonly maxDelayMs: number = 30_000,
  ) {}

  @TraceDecorator()
  async initialize(): Promise<void> {
    for (const queueName of Object.keys(this.eventRouting)) {
      await this.subscribe(queueName);
      logger.info(`Inbox consumer subscribed to ${queueName}`);
    }
  }

  @TraceDecorator()
  private async subscribe(queueName: string): Promise<void> {
    const consumerTag = await this.rabbitClient.consume(queueName, (message) => this.enqueue(queueName, message), {
      prefetch: this.eventRouting[queueName].prefetch,
    });

    this.consumerTags.set(queueName, consumerTag);
  }

  private async unsubscribe(queueName: string): Promise<void> {
    const consumerTag = this.consumerTags.get(queueName);
    if (!consumerTag) return;

    this.consumerTags.delete(queueName);
    await this.rabbitClient.cancelConsumer(consumerTag);
  }

  async stop(): Promise<void> {
    for (const queueName of Object.keys(this.eventRouting)) {
      // Without a connection there is nothing to unsubscribe from: the broker
      // already dropped this consumer and will requeue its unacked messages.
      if (!this.rabbitClient.isConnected()) continue;

      await this.unsubscribe(queueName);
      logger.info(`Inbox consumer "${queueName}" stopped`);
    }
  }

  private async enqueue(queueName: string, message: ConsumeMessage | null): Promise<void> {
    if (!message) return;

    // A parallel queue processes up to `prefetch` messages at once, so the order
    // is not guaranteed there; only queues that do not depend on it opt out.
    if (!this.eventRouting[queueName].isSync) {
      void this.deliver(queueName, message).catch((error) => {
        logger.error(`Inbox consumer "${queueName}": parallel delivery failed`, error);
      });

      return;
    }

    const chain = this.processingChains.get(queueName) ?? Promise.resolve();
    const run = chain.then(() => this.deliver(queueName, message));

    this.processingChains.set(
      queueName,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    await run;
  }

  private async deliver(queueName: string, message: ConsumeMessage): Promise<void> {
    const messageId = message.properties?.messageId;
    const maxAttempts = this.rabbitClient.getQueueDeferAfterAttempts(queueName);

    // Fast path: the marker is already stored, so an earlier delivery has
    // applied this message. It only shortens the duplicate handling — the race
    // between two concurrent deliveries is still settled by the unique index
    // inside commit().
    if (messageId && (await this.isCommitted(queueName, messageId))) {
      metrics.counter('inbox_consumer_duplicates_total', { queue: queueName });
      logger.debug(`Inbox consumer "${queueName}": duplicate message skipped by the inbox`);
      await this.rabbitClient.ack(message);
      return;
    }

    let lastError = '';
    let delayMs = this.initialDelayMs;
    let attempt = 1;

    for (; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.processMessage(queueName, message);

        metrics.counter('inbox_consumer_processed_total', { queue: queueName });
        await this.rabbitClient.ack(message);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);

        // The marker is written by the handler itself, at the end of its own
        // transaction: an error plus a stored marker means the message has
        // already been applied by an earlier (or concurrent) delivery.
        if (messageId && (await this.isCommitted(queueName, messageId))) {
          metrics.counter('inbox_consumer_duplicates_total', { queue: queueName });
          logger.error(
            `Inbox consumer "${queueName}": delivery failed with the inbox marker already stored ` +
              `(a duplicate delivery, or a failure after the commit)`,
            error,
          );
          await this.rabbitClient.ack(message);
          return;
        }

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

    const parkAfterCycles = this.rabbitClient.getQueueParkAfterCycles(queueName);
    const cycles = this.getRetryCycles(message, queueName);

    if (Number.isFinite(parkAfterCycles) && cycles >= parkAfterCycles) {
      await this.park(queueName, message, cycles);
      return;
    }

    // The attempts are exhausted: requeue=false hands the message to the queue's
    // dead-letter setup — the broker parks it in `<queue>.retry` and returns it
    // to the tail of the queue after the TTL. The subscription stays, so the
    // stream keeps running while the message waits.
    try {
      await this.rabbitClient.nack(message, false);
    } catch (error) {
      logger.error(`Inbox consumer "${queueName}": failed to hand the message to the retry queue`, error);
    }
  }

  /** A failing read is not a duplicate: the delivery keeps its retries. */
  private async isCommitted(queueName: string, messageId: string): Promise<boolean> {
    try {
      return await this.consumerService.isCommitted(messageId);
    } catch (error) {
      logger.error(`Inbox consumer "${queueName}": failed to read the inbox marker for "${messageId}"`, error);

      return false;
    }
  }

  private getRetryCycles(message: ConsumeMessage, queueName: string): number {
    const deaths = message.properties.headers?.['x-death'];

    if (!Array.isArray(deaths)) return 0;

    const records = deaths.map(
      (entry) =>
        (Array.isArray(entry) ? Object.fromEntries(entry) : entry) as {
          queue?: string;
          reason?: string;
          count?: number;
        },
    );
    const retryDeath = records.find((record) => record.queue === `${queueName}.retry` && record.reason === 'expired');

    return typeof retryDeath?.count === 'number' ? retryDeath.count : 0;
  }

  private async park(queueName: string, message: ConsumeMessage, cycles: number): Promise<void> {
    const messageId = message.properties?.messageId;

    try {
      await this.rabbitClient.park(`${queueName}.parked`, JSON.parse(message.content.toString()), { messageId });
      await this.rabbitClient.ack(message);

      metrics.counter('inbox_consumer_parked_total', { queue: queueName });
      logger.error(
        `Inbox consumer "${queueName}": messageId "${messageId ?? '-'}" parked after ${cycles} retry cycles`,
      );
    } catch (error) {
      logger.error(`Inbox consumer "${queueName}": failed to park messageId "${messageId ?? '-'}"`, error);

      // Never lose the message: hand it back to the retry queue, the next cycle tries to park again.
      try {
        await this.rabbitClient.nack(message, false);
      } catch (nackError) {
        logger.error(`Inbox consumer "${queueName}": failed to hand the message to the retry queue`, nackError);
      }
    }
  }

  private async processMessage(queueName: string, message: ConsumeMessage): Promise<void> {
    const messageId = message.properties?.messageId;

    if (!messageId) {
      throw new Error('the message has no messageId; the inbox cannot deduplicate it');
    }

    const routingKey = message.fields.routingKey;
    const routing = this.eventRouting[queueName];
    const handlers: Record<string, (event: any, commitInbox: () => Promise<void>) => Promise<void>> = routing.handlers;
    const handler = handlers[routingKey];

    if (!handler) {
      logger.warn(`Inbox consumer "${queueName}": no handler registered for ${routingKey}`);
      return;
    }

    const raw = message.content.toString();

    let payload: unknown;

    try {
      payload = JSON.parse(raw);
    } catch {
      logger.error(
        `Inbox consumer "${queueName}": payload is not valid JSON ` +
        `(routingKey "${routingKey}", messageId "${message.properties.messageId ?? '-'}", body: ${raw.slice(0, 200)})`,
      );

      throw new Error(`Inbox consumer "${queueName}": payload is not valid JSON`);
    }

    let committed = false;

    const commitInbox = async (): Promise<void> => {
      await this.consumerService.commit(messageId);
      committed = true;
    };

    await handler(payload, commitInbox);

    if (!committed) {
      throw new Error('the handler returned without committing the inbox marker');
    }
  }
}
