import type { ConsumeMessage } from 'amqplib';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { metrics } from '@shared/monitoring/src/metrics';
import type { BaseRabbitMQClient } from '@shared/rabbitmq/src/baseRabbitmq.client';
import type { InboxConsumerService } from '../services/inboxConsumer.service';

type TopologyQueues<TRabbitMQClient extends BaseRabbitMQClient> = ReturnType<
  TRabbitMQClient['getTopologyDefinition']
>['queues'];
type InboxEventRouting<TRabbitMQClient extends BaseRabbitMQClient> = {
  [Q in keyof TopologyQueues<TRabbitMQClient>]: {
    prefetch: number;
    isSync: boolean;
    handlers: Record<
      TopologyQueues<TRabbitMQClient>[Q]['bindings'][keyof TopologyQueues<TRabbitMQClient>[Q]['bindings']] extends readonly (infer K)[]
        ? Extract<K, string>
        : never,
      (event: any) => Promise<void>
    >;
  };
};

export abstract class BaseInboxConsumerDaemon<TRabbitMQClient extends BaseRabbitMQClient = BaseRabbitMQClient> {
  private readonly consumerTags = new Map<string, string>();
  private readonly processingChains = new Map<string, Promise<void>>();

  constructor(
    private readonly rabbitClient: TRabbitMQClient,
    private readonly consumerService: InboxConsumerService,
    private readonly eventRouting: InboxEventRouting<TRabbitMQClient>,
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
    const outcome = await this.consumerService.handle(
      queueName,
      message,
      () => this.processMessage(queueName, message),
      this.rabbitClient.getQueueDeferAfterAttempts(queueName),
    );

    if (outcome === 'acked') {
      await this.rabbitClient.ack(message);
      return;
    }

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
    const routingKey = message.fields.routingKey;
    const routing = this.eventRouting[queueName];
    const handlers: Record<string, (event: any) => Promise<void>> = routing.handlers;
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

    await handler(payload);
  }
}
