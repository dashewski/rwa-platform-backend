import type { RabbitMQClient } from '../clients/rabbitmq.client';
import { BaseInboxConsumerDaemon } from '@shared/inbox-consumer';
import type { InboxConsumerService } from '@shared/inbox-consumer';
import type { RiskEvaluationService } from '../services/riskEvaluation.service';

export class InboxConsumerDaemon extends BaseInboxConsumerDaemon {
  constructor(
    rabbitClient: RabbitMQClient,
    consumerService: InboxConsumerService,
    private readonly riskEvaluationService: RiskEvaluationService,
  ) {
    super(rabbitClient, consumerService, {
      [rabbitClient.getEvaluationRequestsQueue()]: {
        prefetch: 5,
        isSync: false,
        handlers: {
          evaluatePool: async (request, commitInbox) => {
            await this.riskEvaluationService.evaluatePool(request, commitInbox);
          },
          evaluateBusiness: async (request, commitInbox) => {
            await this.riskEvaluationService.evaluateBusiness(request, commitInbox);
          },
        },
      },
    });
  }
}
