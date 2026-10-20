import type { RabbitMQClient } from '../clients/rabbitmq.client';
import { BaseInboxConsumerDaemon } from '@shared/inbox-consumer';
import type { InboxConsumerService } from '@shared/inbox-consumer';
import type { BusinessService } from '../services/business.service';
import type { PoolService } from '../services/pool.service';

export class InboxConsumerDaemon extends BaseInboxConsumerDaemon<RabbitMQClient> {
  constructor(
    rabbitClient: RabbitMQClient,
    consumerService: InboxConsumerService,
    private readonly businessService: BusinessService,
    private readonly poolService: PoolService,
  ) {
    super(rabbitClient, consumerService, {
      'blockchain.events.rwa': {
        prefetch: 1,
        isSync: true,
        handlers: {
          RWA_Deployed: async (event, commitInbox) => {
            await this.businessService.syncAfterDeployment(event, commitInbox);
          },
          RWA_PausedStateChanged: async (event, commitInbox) => {
            await this.businessService.syncPausedState(event, commitInbox);
          },
          Pool_Deployed: async (event, commitInbox) => {
            await this.poolService.syncPoolAfterDeployment(event, commitInbox);
          },
          Pool_BonusWithdrawn: async (event, commitInbox) => {
            await this.poolService.syncPoolBonusWithdrawn(event, commitInbox);
          },
          Pool_AwaitingRwaAmountUpdated: async (event, commitInbox) => {
            await this.poolService.syncPoolAwaitingRwaAmount(event, commitInbox);
          },
          Pool_FundsFullyReturned: async (event, commitInbox) => {
            await this.poolService.syncPoolFundsFullyReturned(event, commitInbox);
          },
          Pool_IncomingReturnSummary: async (event, commitInbox) => {
            await this.poolService.syncPoolIncomingReturnSummary(event, commitInbox);
          },
          Pool_IncomingTrancheUpdate: async (event, commitInbox) => {
            await this.poolService.syncPoolIncomingTrancheUpdate(event, commitInbox);
          },
          Pool_OutgoingClaimSummary: async (event, commitInbox) => {
            await this.poolService.syncPoolOutgoingClaimSummary(event, commitInbox);
          },
          Pool_OutgoingTrancheClaimed: async (event, commitInbox) => {
            await this.poolService.syncPoolOutgoingTrancheClaimed(event, commitInbox);
          },
          Pool_PausedStateChanged: async (event, commitInbox) => {
            await this.poolService.syncPoolPausedState(event, commitInbox);
          },
          Pool_ReservesUpdated: async (event, commitInbox) => {
            await this.poolService.syncPoolReserves(event, commitInbox);
          },
          Pool_TargetReached: async (event, commitInbox) => {
            await this.poolService.syncPoolTargetReached(event, commitInbox);
          },
        },
      },
      'evaluation.results': {
        prefetch: 5,
        isSync: false,
        handlers: {
          poolResult: async (result, commitInbox) => {
            await this.poolService.applyEvaluationResult(result, commitInbox);
          },
          businessResult: async (result, commitInbox) => {
            await this.businessService.applyEvaluationResult(result, commitInbox);
          },
        },
      },
    });
  }
}
