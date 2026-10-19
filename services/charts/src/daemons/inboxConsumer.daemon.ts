import type { RabbitMQClient } from '../clients/rabbitmq.client';
import { BaseInboxConsumerDaemon } from '@shared/inbox-consumer';
import type { InboxConsumerService } from '@shared/inbox-consumer';
import type { ChartsService } from '../services/charts.service';
import type { TransactionsService } from '../services/transactions.service';


export class InboxConsumerDaemon extends BaseInboxConsumerDaemon<RabbitMQClient> {
  constructor(
    rabbitClient: RabbitMQClient,
    consumerService: InboxConsumerService,
    private readonly chartsService: ChartsService,
    private readonly transactionsService: TransactionsService,
  ) {
    super(rabbitClient, consumerService, {
      'blockchain.events.charts': {
        prefetch: 1,
        isSync: true,
        handlers: {
          Pool_ReservesUpdated: async (event) => {
            await this.chartsService.recordPriceData(event);
          },
          Pool_RwaMinted: async (event) => {
            await this.transactionsService.recordMint(event);
          },
          Pool_RwaBurned: async (event) => {
            await this.transactionsService.recordBurn(event);
          },
        },
      },
    });
  }
}
