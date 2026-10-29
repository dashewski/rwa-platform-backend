import type { RabbitMQClient } from '../clients/rabbitmq.client';
import { BaseInboxConsumerDaemon } from '@shared/inbox-consumer';
import type { InboxConsumerService } from '@shared/inbox-consumer';
import type { LoyaltyService } from '../services/loyalty.service';

export class InboxConsumerDaemon extends BaseInboxConsumerDaemon {
  constructor(rabbitClient: RabbitMQClient, consumerService: InboxConsumerService, loyaltyService: LoyaltyService) {
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
              Factory_CreateRWAFeeCollected: async (event, commitInbox) => {
                await loyaltyService.processCreateRWAFeeCollected(event, commitInbox);
              },
              Factory_CreatePoolFeeCollected: async (event, commitInbox) => {
                await loyaltyService.processCreatePoolFeeCollected(event, commitInbox);
              },
              Pool_RwaMinted: async (event, commitInbox) => {
                await loyaltyService.processRwaMinted(event, commitInbox);
              },
              Pool_RwaBurned: async (event, commitInbox) => {
                await loyaltyService.processRwaBurned(event, commitInbox);
              },
              ReferralTreasury_Withdrawn: async (event, commitInbox) => {
                await loyaltyService.processReferralTreasuryWithdrawn(event, commitInbox);
              },
            },
          },
        ]),
      ),
    );
  }
}
