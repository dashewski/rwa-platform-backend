import { BaseJobQueueDaemon } from '@shared/job-queue/src/daemons/baseJobQueue.daemon';
import type { JobQueueClient } from '../clients/jobQueue.client';
import type { EvaluationService } from '../services/evaluation.service';

export class JobQueueDaemon extends BaseJobQueueDaemon {
  constructor(
    jobQueueClient: JobQueueClient,
    private readonly evaluationService: EvaluationService,
  ) {
    super(jobQueueClient);
  }

  protected getTasks() {
    return {
      evaluation: [
        (state: Record<string, any>) =>
          this.evaluationService.collectContext({ entityType: state.entityType, entityId: state.entityId }),
        (state: Record<string, any>) =>
          this.evaluationService.selectFiles({ context: state.context, files: state.files }),
        (state: Record<string, any>) =>
          this.evaluationService.summarize({ context: state.context, selectedFiles: state.selectedFiles }),
        (state: Record<string, any>) => this.evaluationService.score({ summary: state.summary }),
        (state: Record<string, any>) =>
          this.evaluationService.save({
            evaluationId: state.evaluationId,
            entityType: state.entityType,
            entityId: state.entityId,
            ownerId: state.ownerId,
            ownerType: state.ownerType,
            grandParentId: state.grandParentId,
            summary: state.summary,
            selectedFiles: state.selectedFiles,
            risk: state.risk,
          }),
      ],
    };
  }
}
