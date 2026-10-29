import type { RabbitMQClient } from '../clients/rabbitmq.client';
import { BaseInboxConsumerDaemon } from '@shared/inbox-consumer';
import type { InboxConsumerService } from '@shared/inbox-consumer';
import type { PortfolioService } from '../services/portfolio.service';

export class InboxConsumerDaemon extends BaseInboxConsumerDaemon {
  constructor(
    rabbitClient: RabbitMQClient,
    consumerService: InboxConsumerService,
    portfolioService: PortfolioService,
  ) {
    super(
      rabbitClient,
      consumerService,
      Object.fromEntries(
        rabbitClient.getBlockchainEventsQueues().map((queue) => [
          queue,
          {
            prefetch: 1,
            isSync: true,
            handlers: {
              RWA_Transfer: async (event, commitInbox) => {
                await portfolioService.processTransfer(event, commitInbox);
              },
            },
          },
        ]),
      ),
    );
  }
}
