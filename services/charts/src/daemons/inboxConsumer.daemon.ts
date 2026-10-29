import type { RabbitMQClient } from '../clients/rabbitmq.client';
import { BaseInboxConsumerDaemon } from '@shared/inbox-consumer';
import type { InboxConsumerService } from '@shared/inbox-consumer';
import type { ChartsService } from '../services/charts.service';
import type { TransactionsService } from '../services/transactions.service';

export class InboxConsumerDaemon extends BaseInboxConsumerDaemon {
  constructor(
    rabbitClient: RabbitMQClient,
    consumerService: InboxConsumerService,
    chartsService: ChartsService,
    transactionsService: TransactionsService,
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
              Pool_ReservesUpdated: async (event, commitInbox) => {
                await chartsService.recordPriceData(event, commitInbox);
              },
              Pool_RwaMinted: async (event, commitInbox) => {
                await transactionsService.recordMint(event, commitInbox);
              },
              Pool_RwaBurned: async (event, commitInbox) => {
                await transactionsService.recordBurn(event, commitInbox);
              },
            },
          },
        ]),
      ),
    );
  }
}
