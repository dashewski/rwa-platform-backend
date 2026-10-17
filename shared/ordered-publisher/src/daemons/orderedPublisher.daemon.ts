import { logger } from '@shared/monitoring/src/monitoring.plugin';
import type { OrderedPublisherService } from '../services/orderedPublisher.service';


export class OrderedPublisherDaemon {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(
    private readonly publisherService: OrderedPublisherService,
    private readonly pollIntervalMs: number = 500,
  ) {}

  initialize(): void {
    this.stopped = false;
    this.scheduleTick();
    logger.info(
      `Ordered publisher daemon "${this.publisherService.exchange}" started (every ${this.pollIntervalMs}ms)`,
    );
  }

  stop(): void {
    this.stopped = true;
    this.clearTimer();
    logger.info(`Ordered publisher daemon "${this.publisherService.exchange}" stopped`);
  }

  private async tick(): Promise<void> {
    try {
      await this.publisherService.processOutbox();
    } catch (error) {
      logger.error('Ordered publisher daemon: outbox pass failed', error);
    }

    if (!this.stopped) {
      this.scheduleTick();
    }
  }

  private scheduleTick(): void {
    this.timer = setTimeout(() => void this.tick(), this.pollIntervalMs);
    (this.timer as unknown as { unref?: () => void }).unref?.();
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
