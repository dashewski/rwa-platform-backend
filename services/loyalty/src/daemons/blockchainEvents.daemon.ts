import type { RabbitMQClient } from '@shared/rabbitmq/src/rabbitmq.client';
import { OrderedConsumerDaemon } from '@shared/ordered-consumer';
import type { OrderedConsumerService } from '@shared/ordered-consumer/src/services/orderedConsumer.service';
import type { BlockchainEvent } from '@shared/blockchain';
import { LoyaltyService } from '../services/loyalty.service';

export const BLOCKCHAIN_EVENTS_EXCHANGE = 'blockchain.events';
export const BLOCKCHAIN_EVENTS_QUEUE = 'blockchain.events.loyalty';

export class BlockchainEventsDaemon extends OrderedConsumerDaemon {
  constructor(
    rabbitClient: RabbitMQClient,
    consumerService: OrderedConsumerService,
    private readonly loyaltyService: LoyaltyService,
  ) {
    super(rabbitClient, consumerService, BLOCKCHAIN_EVENTS_EXCHANGE, {
      Factory_CreateRWAFeeCollected: async (event: BlockchainEvent) => {
        await this.loyaltyService.processCreateRWAFeeCollected(event as any);
      },

      Factory_CreatePoolFeeCollected: async (event: BlockchainEvent) => {
        await this.loyaltyService.processCreatePoolFeeCollected(event as any);
      },

      Pool_RwaMinted: async (event: BlockchainEvent) => {
        await this.loyaltyService.processRwaMinted(event as any);
      },

      Pool_RwaBurned: async (event: BlockchainEvent) => {
        await this.loyaltyService.processRwaBurned(event as any);
      },

      ReferralTreasury_Withdrawn: async (event: BlockchainEvent) => {
        await this.loyaltyService.processReferralTreasuryWithdrawn(event as any);
      },
    });
  }
}
