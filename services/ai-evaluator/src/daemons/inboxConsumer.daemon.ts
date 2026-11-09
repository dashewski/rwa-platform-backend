import { BaseInboxConsumerDaemon } from '@shared/inbox-consumer';
import type { InboxConsumerService } from '@shared/inbox-consumer';
import type { RabbitMQClient } from '../clients/rabbitmq.client';
import type { EvaluationService } from '../services/evaluation.service';

export class InboxConsumerDaemon extends BaseInboxConsumerDaemon {
  constructor(
    rabbitClient: RabbitMQClient,
    consumerService: InboxConsumerService,
    evaluationService: EvaluationService,
  ) {
    super(rabbitClient, consumerService, {
      [rabbitClient.getEvaluationRequestsQueue()]: {
        prefetch: 5,
        isSync: false,
        handlers: {
          evaluate: async (event, commitInbox) => {
            await evaluationService.processEvaluation(event, commitInbox);
          },
        },
      },
    });
  }
}
