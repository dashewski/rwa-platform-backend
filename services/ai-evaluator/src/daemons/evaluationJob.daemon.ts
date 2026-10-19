import { logger } from '@shared/monitoring/src/monitoring.plugin';
import type { RiskEvaluationService } from '../services/riskEvaluation.service';

export class EvaluationJobDaemon {
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = false;

  constructor(
    private readonly riskEvaluationService: RiskEvaluationService,
    private readonly pollIntervalMs: number,
    private readonly concurrency: number,
  ) {}

  initialize() {
    this.stopped = false;
    this.scheduleTick();
    logger.info(`Evaluation job daemon started (every ${this.pollIntervalMs}ms)`);
  }

  stop() {
    this.stopped = true;

    if (this.timer) clearTimeout(this.timer);
  }

  private scheduleTick() {
    this.timer = setTimeout(() => void this.tick(), this.pollIntervalMs);
    this.timer.unref();
  }

  private async tick() {
    try {
      await this.riskEvaluationService.processEvaluationJobs(this.concurrency);
    } catch (error) {
      logger.error('Evaluation job daemon: the pass failed:', error);
    }

    if (!this.stopped) this.scheduleTick();
  }
}
