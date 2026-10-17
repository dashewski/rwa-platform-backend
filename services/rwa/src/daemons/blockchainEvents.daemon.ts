import type { RabbitMQClient } from '@shared/rabbitmq/src/rabbitmq.client';
import { OrderedConsumerDaemon } from '@shared/ordered-consumer';
import type { OrderedConsumerService } from '@shared/ordered-consumer/src/services/orderedConsumer.service';
import type { BlockchainEvent } from '@shared/blockchain';
import { BusinessService } from '../services/business.service';
import { PoolService } from '../services/pool.service';

export const BLOCKCHAIN_EVENTS_EXCHANGE = 'blockchain.events';
export const BLOCKCHAIN_EVENTS_QUEUE = 'blockchain.events.rwa';

export class BlockchainEventsDaemon extends OrderedConsumerDaemon {
  constructor(
    rabbitClient: RabbitMQClient,
    consumerService: OrderedConsumerService,
    private readonly businessService: BusinessService,
    private readonly poolService: PoolService,
  ) {
    super(rabbitClient, consumerService, BLOCKCHAIN_EVENTS_EXCHANGE, {
      RWA_Deployed: async (event: BlockchainEvent) => {
        // Update business contract data
        await this.businessService.syncAfterDeployment(event.data as any, { sourceId: this.sourceIdOf(event) });
      },

      RWA_PausedStateChanged: async (event: BlockchainEvent) => {
        // Update business pause flag
        await this.businessService.syncPausedState(event.data as any);
      },

      Pool_Deployed: async (event: BlockchainEvent) => {
        // Update pool info with all parameters from event
        await this.poolService.syncPoolAfterDeployment(event.data as any, { sourceId: this.sourceIdOf(event) });
      },

      Pool_BonusWithdrawn: async (event: BlockchainEvent) => {
        await this.poolService.syncPoolBonusWithdrawn(event.data as any);
      },

      Pool_AwaitingRwaAmountUpdated: async (event: BlockchainEvent) => {
        await this.poolService.syncPoolAwaitingRwaAmount(event.data as any);
      },

      Pool_FundsFullyReturned: async (event: BlockchainEvent) => {
        await this.poolService.syncPoolFundsFullyReturned(event.data as any);
      },

      Pool_IncomingReturnSummary: async (event: BlockchainEvent) => {
        await this.poolService.syncPoolIncomingReturnSummary(event.data as any);
      },

      Pool_IncomingTrancheUpdate: async (event: BlockchainEvent) => {
        await this.poolService.syncPoolIncomingTrancheUpdate(event.data as any);
      },

      Pool_OutgoingClaimSummary: async (event: BlockchainEvent) => {
        await this.poolService.syncPoolOutgoingClaimSummary(event.data as any);
      },

      Pool_OutgoingTrancheClaimed: async (event: BlockchainEvent) => {
        await this.poolService.syncPoolOutgoingTrancheClaimed(event.data as any);
      },

      Pool_PausedStateChanged: async (event: BlockchainEvent) => {
        await this.poolService.syncPoolPausedState(event.data as any);
      },

      Pool_ReservesUpdated: async (event: BlockchainEvent) => {
        await this.poolService.syncPoolReserves(event.data as any);
      },

      Pool_TargetReached: async (event: BlockchainEvent) => {
        await this.poolService.syncPoolTargetReached(event.data as any);
      },
    });
  }

  /** Stable identity of the on-chain event; used as the webhook event id. */
  private sourceIdOf(event: BlockchainEvent): string {
    return `${event.chainId}:${event.transactionHash}:${event.logIndex}`;
  }
}
