import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import type { EvaluationJobService } from '../services/evaluationJob.service';

export class EvaluationWorkerDaemon {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = 0;
  private stopped = true;

  constructor(
    private readonly evaluationJobService: EvaluationJobService,
    private readonly pollIntervalMs: number = 500,
    private readonly concurrency: number = 5,
  ) {}

  async initialize() {
    this.stopped = false;
    this.scheduleTick();
  }

  async stop() {
    this.stopped = true;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleTick() {
    const timer = setTimeout(() => void this.tick(), this.pollIntervalMs);
    (timer as unknown as { unref?: () => void }).unref?.();

    this.timer = timer;
  }

  @TraceDecorator()
  private async tick() {
    while (!this.stopped && this.inFlight < this.concurrency) {
      this.inFlight += 1;

      void this.evaluationJobService
        .processNext()
        .catch((error) => {
          logger.error(`Evaluation worker tick failed: ${error instanceof Error ? error.message : String(error)}`);
        })
        .finally(() => {
          this.inFlight -= 1;
        });
    }

    if (!this.stopped) {
      this.scheduleTick();
    }
  }
}
