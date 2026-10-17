import type { RabbitMQClient } from '@shared/rabbitmq/src/rabbitmq.client';
import { OrderedConsumerDaemon } from '@shared/ordered-consumer';
import type { OrderedConsumerService } from '@shared/ordered-consumer/src/services/orderedConsumer.service';
import type { BlockchainEvent } from '@shared/blockchain';
import { PortfolioService } from '../services/portfolio.service';

export const BLOCKCHAIN_EVENTS_EXCHANGE = 'blockchain.events';
export const BLOCKCHAIN_EVENTS_QUEUE = 'blockchain.events.portfolio';

export class BlockchainEventsDaemon extends OrderedConsumerDaemon {
  constructor(
    rabbitClient: RabbitMQClient,
    consumerService: OrderedConsumerService,
    private readonly portfolioService: PortfolioService,
  ) {
    super(rabbitClient, consumerService, BLOCKCHAIN_EVENTS_EXCHANGE, {
      RWA_Transfer: async (event: BlockchainEvent) => {
        const {
          emittedFrom, // rwa address
          from,
          to,
          tokenId,
          amount,
          pool,
        } = event.data;

        await this.portfolioService.processTransfer({
          from,
          to,
          tokenAddress: emittedFrom,
          tokenId,
          chainId: `${event.chainId}`,
          transactionHash: event.transactionHash,
          blockNumber: event.blockNumber,
          amount: Number(amount),
          poolAddress: pool,
        });
      },
    });
  }
}
