import type { ConsumeMessage } from 'amqplib';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { metrics } from '@shared/monitoring/src/metrics';
import type { RabbitMQClient } from '@shared/rabbitmq/src/rabbitmq.client';
import type { OrderedConsumerService } from '../services/orderedConsumer.service';


export abstract class OrderedConsumerDaemon {
  private consumerTag: string | null = null;
  private processingChain: Promise<void> = Promise.resolve();
  private probeTimer: ReturnType<typeof setTimeout> | null = null;
  private probing = false;

  constructor(
    private readonly rabbitClient: RabbitMQClient,
    private readonly consumerService: OrderedConsumerService,
    private readonly exchange: string,
    private eventRouting: { [eventName: string]: (event: any) => Promise<void> },
    private readonly probeIntervalMs: number = 60_000,
  ) { }

  getEventRouting() {
    return this.eventRouting
  }

  @TraceDecorator()
  async initialize(): Promise<void> {
    await this.rabbitClient.setupQueue(this.consumerService.queueName, { durable: true });

    for (const eventName of Object.keys(this.getEventRouting())) {
      await this.rabbitClient.bindQueue(this.consumerService.queueName, this.exchange, eventName);
    }

    await this.subscribe();
    logger.info(`Ordered consumer subscribed to ${this.consumerService.queueName}`);
  }

  @TraceDecorator()
  async subscribe(): Promise<void> {
    this.consumerTag = await this.rabbitClient.consume(
      this.consumerService.queueName,
      (message) => this.enqueue(message),
      { prefetch: 1 },
    );
  }

  async unsubscribe(): Promise<void> {
    if (!this.consumerTag) return;

    const consumerTag = this.consumerTag;
    this.consumerTag = null;
    await this.rabbitClient.cancelConsumer(consumerTag);
  }

  async stop(): Promise<void> {
    this.clearProbeTimer();
    await this.unsubscribe();
    logger.info(`Ordered consumer "${this.consumerService.queueName}" stopped`);
  }

  private async enqueue(message: ConsumeMessage | null): Promise<void> {
    if (!message) return;

    const run = this.processingChain.then(() => this.deliver(message));
    this.processingChain = run.then(
      () => undefined,
      () => undefined,
    );
    await run;
  }

  private async deliver(message: ConsumeMessage): Promise<void> {
    const outcome = await this.consumerService.handle(message, () => this.processMessage(message));

    if (outcome === 'acked') {
      await this.rabbitClient.ack(message);
      return;
    }

    // The stream is halted: arm the probe first, so the stream comes back even
    // if releasing the failed message does not go through.
    this.scheduleProbe();

    try {
      await this.unsubscribe();
      await this.rabbitClient.nack(message, true);
    } catch (error) {
      logger.error(
        `Ordered consumer "${this.consumerService.queueName}": failed to release the halted message back to the queue`,
        error,
      );
    }
  }

  private async processMessage(message: ConsumeMessage): Promise<void> {
    const event = JSON.parse(message.content.toString());
    const handler = this.getEventRouting()[event.name];

    if (!handler) {
      logger.warn(`No handler registered for event ${event.name}`);
      return;
    }

    await handler(event);
  }

  private scheduleProbe(): void {
    this.clearProbeTimer();
    this.probeTimer = setTimeout(() => void this.probe(), this.probeIntervalMs);
    (this.probeTimer as unknown as { unref?: () => void }).unref?.();
  }

  private async probe(): Promise<void> {
    this.probeTimer = null;

    if (this.probing) return;
    if (this.consumerService.status().state !== 'halted') return;

    this.probing = true;
    metrics.counter('ordered_consumer_probes_total', { queue: this.consumerService.queueName });

    try {
      await this.subscribe();
      this.consumerService.markProbed();
    } catch (error) {
      logger.error(`Ordered consumer "${this.consumerService.queueName}": probe failed to resubscribe`, error);
      this.scheduleProbe();
    } finally {
      this.probing = false;
    }
  }

  private clearProbeTimer(): void {
    if (this.probeTimer) {
      clearTimeout(this.probeTimer);
      this.probeTimer = null;
    }
  }
}
