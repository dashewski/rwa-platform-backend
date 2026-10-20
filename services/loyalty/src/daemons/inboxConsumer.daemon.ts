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
          Factory_CreateRWAFeeCollected: async (event, commitInbox) => {
            await this.loyaltyService.processCreateRWAFeeCollected(event, commitInbox);
          },
          Factory_CreatePoolFeeCollected: async (event, commitInbox) => {
            await this.loyaltyService.processCreatePoolFeeCollected(event, commitInbox);
          },
          Pool_RwaMinted: async (event, commitInbox) => {
            await this.loyaltyService.processRwaMinted(event, commitInbox);
          },
          Pool_RwaBurned: async (event, commitInbox) => {
            await this.loyaltyService.processRwaBurned(event, commitInbox);
          },
          ReferralTreasury_Withdrawn: async (event, commitInbox) => {
            await this.loyaltyService.processReferralTreasuryWithdrawn(event, commitInbox);
          },
        },
      },
    });
  }
}
