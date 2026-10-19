import type { RabbitMQClient } from '../clients/rabbitmq.client';
import { BaseInboxConsumerDaemon } from '@shared/inbox-consumer';
import type { InboxConsumerService } from '@shared/inbox-consumer';
import type { PortfolioService } from '../services/portfolio.service';


export class InboxConsumerDaemon extends BaseInboxConsumerDaemon<RabbitMQClient> {
  constructor(
    rabbitClient: RabbitMQClient,
    consumerService: InboxConsumerService,
    private readonly portfolioService: PortfolioService,
  ) {
    super(rabbitClient, consumerService, {
      'blockchain.events.portfolio': {
        prefetch: 1,
        isSync: true,
        handlers: {
          RWA_Transfer: async (event) => {
            await this.portfolioService.processTransfer(event);
          },
        },
      },
    });
  }
}
