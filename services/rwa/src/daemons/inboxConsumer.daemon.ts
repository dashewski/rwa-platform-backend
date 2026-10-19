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
          RWA_Deployed: async (event) => {
            await this.businessService.syncAfterDeployment(event);
          },
          RWA_PausedStateChanged: async (event) => {
            await this.businessService.syncPausedState(event);
          },
          Pool_Deployed: async (event) => {
            await this.poolService.syncPoolAfterDeployment(event);
          },
          Pool_BonusWithdrawn: async (event) => {
            await this.poolService.syncPoolBonusWithdrawn(event);
          },
          Pool_AwaitingRwaAmountUpdated: async (event) => {
            await this.poolService.syncPoolAwaitingRwaAmount(event);
          },
          Pool_FundsFullyReturned: async (event) => {
            await this.poolService.syncPoolFundsFullyReturned(event);
          },
          Pool_IncomingReturnSummary: async (event) => {
            await this.poolService.syncPoolIncomingReturnSummary(event);
          },
          Pool_IncomingTrancheUpdate: async (event) => {
            await this.poolService.syncPoolIncomingTrancheUpdate(event);
          },
          Pool_OutgoingClaimSummary: async (event) => {
            await this.poolService.syncPoolOutgoingClaimSummary(event);
          },
          Pool_OutgoingTrancheClaimed: async (event) => {
            await this.poolService.syncPoolOutgoingTrancheClaimed(event);
          },
          Pool_PausedStateChanged: async (event) => {
            await this.poolService.syncPoolPausedState(event);
          },
          Pool_ReservesUpdated: async (event) => {
            await this.poolService.syncPoolReserves(event);
          },
          Pool_TargetReached: async (event) => {
            await this.poolService.syncPoolTargetReached(event);
          },
        },
      },
      'evaluation.results': {
        prefetch: 1,
        isSync: true,
        handlers: {
          poolResult: async (result) => {
            await this.poolService.applyEvaluationResult(result);
          },
          businessResult: async (result) => {
            await this.businessService.applyEvaluationResult(result);
          },
        },
      },
    });
  }
}
