import type { RabbitMQClient } from '../clients/rabbitmq.client';
import { BaseInboxConsumerDaemon } from '@shared/inbox-consumer';
import type { InboxConsumerService } from '@shared/inbox-consumer';
import type { SignatureService } from '../services/signature.service';

export class InboxConsumerDaemon extends BaseInboxConsumerDaemon<RabbitMQClient> {
  constructor(
    rabbitClient: RabbitMQClient,
    consumerService: InboxConsumerService,
    private readonly signatureService: SignatureService,
  ) {
    super(rabbitClient, consumerService, {
      [`sign.requests.${rabbitClient.channelName}`]: {
        prefetch: 1,
        isSync: true,
        handlers: {
          task: async (request) => {
            await this.signatureService.signHash(request);
          },
        },
      },
    });
  }
}
