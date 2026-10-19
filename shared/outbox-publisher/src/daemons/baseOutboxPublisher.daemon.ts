import { logger } from '@shared/monitoring/src/monitoring.plugin';
import type { BaseRabbitMQClient } from '@shared/rabbitmq/src/baseRabbitmq.client';
import type { OutboxPublisherService } from '../services/outboxPublisher.service';


export abstract class BaseOutboxPublisherDaemon<TRabbitMQClient extends BaseRabbitMQClient = BaseRabbitMQClient> {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private stopped = false;

  constructor(
    private readonly publisherService: OutboxPublisherService,
    private readonly pollIntervalMs: number,
    private readonly exchangesConfig: {
      [E in keyof ReturnType<TRabbitMQClient['getTopologyDefinition']>['exchanges']]: {
        isSync: boolean;
        concurrency: number;
        maxAttempts: number;
      };
    },
  ) { }

  async initialize() {
    this.stopped = false;

    for (const [exchange] of Object.entries(this.exchangesConfig)) {
      this.scheduleTick(exchange);
      logger.info(`Outbox publisher daemon "${exchange}" started (every ${this.pollIntervalMs}ms)`);
    }
  }

  stop(): void {
    this.stopped = true;

    for (const [exchange, timer] of this.timers) {
      clearTimeout(timer);
      logger.info(`Outbox publisher daemon "${exchange}" stopped`);
    }

    this.timers.clear();
  }

  private async tick(exchange: string): Promise<void> {
    const config = this.exchangesConfig[exchange]!;

    try {
      await this.publisherService.processOutbox(
        exchange,
        config.isSync,
        config.concurrency,
        config.maxAttempts,
      );
    } catch (error) {
      logger.error(`Outbox publisher daemon "${exchange}": outbox pass failed`, error);
    }

    if (!this.stopped) {
      this.scheduleTick(exchange);
    }
  }

  private scheduleTick(exchange: string): void {
    const timer = setTimeout(() => void this.tick(exchange), this.pollIntervalMs);
    (timer as unknown as { unref?: () => void }).unref?.();
    this.timers.set(exchange, timer);
  }
}
