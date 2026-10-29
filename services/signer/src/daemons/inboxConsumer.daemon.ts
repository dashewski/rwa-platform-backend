import type { RabbitMQClient } from '../clients/rabbitmq.client';
import { BaseInboxConsumerDaemon } from '@shared/inbox-consumer';
import type { InboxConsumerService } from '@shared/inbox-consumer';
import type { SignatureService } from '../services/signature.service';

export class InboxConsumerDaemon extends BaseInboxConsumerDaemon {
  constructor(
    rabbitClient: RabbitMQClient,
    consumerService: InboxConsumerService,
    private readonly signatureService: SignatureService,
  ) {
    super(rabbitClient, consumerService, {
      [rabbitClient.getSignRequestsQueue()]: {
        prefetch: 5,
        isSync: false,
        handlers: {
          task: async (request, commitInbox) => {
            await this.signatureService.signHash(request, commitInbox);
          },
        },
      },
    });
  }
}
