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
          Governance_ProposalCreated: async (event, commitInbox) => {
            await this.daoService.processProposalCreated(event, commitInbox);
          },
          Governance_ProposalExecuted: async (event, commitInbox) => {
            await this.daoService.processProposalExecuted(event, commitInbox);
          },
          Governance_ProposalCancelled: async (event, commitInbox) => {
            await this.daoService.processProposalCancelled(event, commitInbox);
          },
          Governance_VoteCast: async (event, commitInbox) => {
            await this.daoService.processVoteCast(event, commitInbox);
          },
          DaoStaking_TokensStaked: async (event, commitInbox) => {
            await this.daoService.processTokensStaked(event, commitInbox);
          },
          DaoStaking_TokensUnstaked: async (event, commitInbox) => {
            await this.daoService.processTokensUnstaked(event, commitInbox);
          },
          DaoStaking_TokensLocked: async (event, commitInbox) => {
            await this.daoService.processTokensLocked(event, commitInbox);
          },
          Timelock_TransactionQueued: async (event, commitInbox) => {
            await this.daoService.processTransactionQueued(event, commitInbox);
          },
          Timelock_TransactionExecuted: async (event, commitInbox) => {
            await this.daoService.processTransactionExecuted(event, commitInbox);
          },
          Timelock_TransactionCancelled: async (event, commitInbox) => {
            await this.daoService.processTransactionCancelled(event, commitInbox);
          },
          Treasury_Withdrawal: async (event, commitInbox) => {
            await this.daoService.processTreasuryWithdrawal(event, commitInbox);
          },
        },
      },
    });
  }
}
