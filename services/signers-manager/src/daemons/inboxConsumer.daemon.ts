import type { RabbitMQClient } from '../clients/rabbitmq.client';
import { BaseInboxConsumerDaemon } from '@shared/inbox-consumer';
import type { InboxConsumerService } from '@shared/inbox-consumer';
import type { SignaturesService } from '../services/signatures.service';

export class InboxConsumerDaemon extends BaseInboxConsumerDaemon<RabbitMQClient> {
  constructor(
    rabbitClient: RabbitMQClient,
    consumerService: InboxConsumerService,
    private readonly signaturesService: SignaturesService,
  ) {
    super(rabbitClient, consumerService, {
      'sign.responses': {
        prefetch: 1,
        isSync: true,
        handlers: {
          response: async (response) => {
            await this.signaturesService.addSignature(response);
          },
        },
      },
    });
  }
}
