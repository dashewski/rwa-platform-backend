import type { RabbitMQClient } from '@shared/rabbitmq/src/rabbitmq.client';
import { OrderedConsumerDaemon } from '@shared/ordered-consumer';
import type { OrderedConsumerService } from '@shared/ordered-consumer/src/services/orderedConsumer.service';
import type { BlockchainEvent } from '@shared/blockchain';
import { DaoService } from '../services/dao.service';

export const BLOCKCHAIN_EVENTS_EXCHANGE = 'blockchain.events';
export const BLOCKCHAIN_EVENTS_QUEUE = 'blockchain.events.dao';

export class BlockchainEventsDaemon extends OrderedConsumerDaemon {
  constructor(
    rabbitClient: RabbitMQClient,
    consumerService: OrderedConsumerService,
    private readonly daoService: DaoService,
  ) {
    super(rabbitClient, consumerService, BLOCKCHAIN_EVENTS_EXCHANGE, {
      Governance_ProposalCreated: async (event: BlockchainEvent) => {
        await this.daoService.processProposalCreated(event as any);
      },

      Governance_ProposalExecuted: async (event: BlockchainEvent) => {
        await this.daoService.processProposalExecuted(event as any);
      },

      Governance_ProposalCancelled: async (event: BlockchainEvent) => {
        await this.daoService.processProposalCancelled(event as any);
      },

      Governance_VoteCast: async (event: BlockchainEvent) => {
        await this.daoService.processVoteCast(event as any);
      },

      DaoStaking_TokensStaked: async (event: BlockchainEvent) => {
        await this.daoService.processTokensStaked(event as any);
      },

      DaoStaking_TokensUnstaked: async (event: BlockchainEvent) => {
        await this.daoService.processTokensUnstaked(event as any);
      },

      DaoStaking_TokensLocked: async (event: BlockchainEvent) => {
        await this.daoService.processTokensLocked(event as any);
      },

      Timelock_TransactionQueued: async (event: BlockchainEvent) => {
        await this.daoService.processTransactionQueued(event as any);
      },

      Timelock_TransactionExecuted: async (event: BlockchainEvent) => {
        await this.daoService.processTransactionExecuted(event as any);
      },

      Timelock_TransactionCancelled: async (event: BlockchainEvent) => {
        await this.daoService.processTransactionCancelled(event as any);
      },

      Treasury_Withdrawal: async (event: BlockchainEvent) => {
        await this.daoService.processTreasuryWithdrawal(event as any);
      },
    });
  }
}
