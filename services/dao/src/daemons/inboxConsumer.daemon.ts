import type { RabbitMQClient } from '../clients/rabbitmq.client';
import { BaseInboxConsumerDaemon } from '@shared/inbox-consumer';
import type { InboxConsumerService } from '@shared/inbox-consumer';
import type { DaoService } from '../services/dao.service';


export class InboxConsumerDaemon extends BaseInboxConsumerDaemon<RabbitMQClient> {
  constructor(
    rabbitClient: RabbitMQClient,
    consumerService: InboxConsumerService,
    private readonly daoService: DaoService,
  ) {
    super(rabbitClient, consumerService, {
      'blockchain.events.dao': {
        prefetch: 1,
        isSync: true,
        handlers: {
          Governance_ProposalCreated: async (event) => {
            await this.daoService.processProposalCreated(event);
          },
          Governance_ProposalExecuted: async (event) => {
            await this.daoService.processProposalExecuted(event);
          },
          Governance_ProposalCancelled: async (event) => {
            await this.daoService.processProposalCancelled(event);
          },
          Governance_VoteCast: async (event) => {
            await this.daoService.processVoteCast(event);
          },
          DaoStaking_TokensStaked: async (event) => {
            await this.daoService.processTokensStaked(event);
          },
          DaoStaking_TokensUnstaked: async (event) => {
            await this.daoService.processTokensUnstaked(event);
          },
          DaoStaking_TokensLocked: async (event) => {
            await this.daoService.processTokensLocked(event);
          },
          Timelock_TransactionQueued: async (event) => {
            await this.daoService.processTransactionQueued(event);
          },
          Timelock_TransactionExecuted: async (event) => {
            await this.daoService.processTransactionExecuted(event);
          },
          Timelock_TransactionCancelled: async (event) => {
            await this.daoService.processTransactionCancelled(event);
          },
          Treasury_Withdrawal: async (event) => {
            await this.daoService.processTreasuryWithdrawal(event);
          },
        },
      },
    });
  }
}
