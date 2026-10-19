import type { RabbitMQClient } from '../clients/rabbitmq.client';
import { BaseInboxConsumerDaemon } from '@shared/inbox-consumer';
import type { InboxConsumerService } from '@shared/inbox-consumer';
import type { LoyaltyService } from '../services/loyalty.service';

export class InboxConsumerDaemon extends BaseInboxConsumerDaemon<RabbitMQClient> {
  constructor(
    rabbitClient: RabbitMQClient,
    consumerService: InboxConsumerService,
    private readonly loyaltyService: LoyaltyService,
  ) {
    super(rabbitClient, consumerService, {
      'blockchain.events.loyalty': {
        prefetch: 1,
        isSync: true,
        handlers: {
          Factory_CreateRWAFeeCollected: async (event) => {
            await this.loyaltyService.processCreateRWAFeeCollected(event);
          },
          Factory_CreatePoolFeeCollected: async (event) => {
            await this.loyaltyService.processCreatePoolFeeCollected(event);
          },
          Pool_RwaMinted: async (event) => {
            await this.loyaltyService.processRwaMinted(event);
          },
          Pool_RwaBurned: async (event) => {
            await this.loyaltyService.processRwaBurned(event);
          },
          ReferralTreasury_Withdrawn: async (event) => {
            await this.loyaltyService.processReferralTreasuryWithdrawn(event);
          },
        },
      },
    });
  }
}
