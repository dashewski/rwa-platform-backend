import type { RabbitMQClient } from '../clients/rabbitmq.client';
import { BaseInboxConsumerDaemon } from '@shared/inbox-consumer';
import type { InboxConsumerService } from '@shared/inbox-consumer';
import type { BusinessService } from '../services/business.service';
import type { PoolService } from '../services/pool.service';

export class InboxConsumerDaemon extends BaseInboxConsumerDaemon {
  constructor(
    rabbitClient: RabbitMQClient,
    consumerService: InboxConsumerService,
    businessService: BusinessService,
    poolService: PoolService,
  ) {
    super(rabbitClient, consumerService, {
      [rabbitClient.getEvaluationResultsQueue()]: {
        prefetch: 5,
        isSync: false,
        handlers: {
          poolResult: async (result, commitInbox) => {
            await poolService.applyEvaluationResult(result, commitInbox);
          },
          businessResult: async (result, commitInbox) => {
            await businessService.applyEvaluationResult(result, commitInbox);
          },
        },
      },
      ...Object.fromEntries(
        rabbitClient.getBlockchainEventsQueues().map((queue) => [
          queue,
          {
            prefetch: 1,
            isSync: true,
            handlers: {
              RWA_Deployed: async (event, commitInbox) => {
                await businessService.syncAfterDeployment(event, commitInbox);
              },
              RWA_PausedStateChanged: async (event, commitInbox) => {
                await businessService.syncPausedState(event, commitInbox);
              },
              Pool_Deployed: async (event, commitInbox) => {
                await poolService.syncPoolAfterDeployment(event, commitInbox);
              },
              Pool_BonusWithdrawn: async (event, commitInbox) => {
                await poolService.syncPoolBonusWithdrawn(event, commitInbox);
              },
              Pool_AwaitingRwaAmountUpdated: async (event, commitInbox) => {
                await poolService.syncPoolAwaitingRwaAmount(event, commitInbox);
              },
              Pool_FundsFullyReturned: async (event, commitInbox) => {
                await poolService.syncPoolFundsFullyReturned(event, commitInbox);
              },
              Pool_IncomingReturnSummary: async (event, commitInbox) => {
                await poolService.syncPoolIncomingReturnSummary(event, commitInbox);
              },
              Pool_IncomingTrancheUpdate: async (event, commitInbox) => {
                await poolService.syncPoolIncomingTrancheUpdate(event, commitInbox);
              },
              Pool_OutgoingClaimSummary: async (event, commitInbox) => {
                await poolService.syncPoolOutgoingClaimSummary(event, commitInbox);
              },
              Pool_OutgoingTrancheClaimed: async (event, commitInbox) => {
                await poolService.syncPoolOutgoingTrancheClaimed(event, commitInbox);
              },
              Pool_PausedStateChanged: async (event, commitInbox) => {
                await poolService.syncPoolPausedState(event, commitInbox);
              },
              Pool_ReservesUpdated: async (event, commitInbox) => {
                await poolService.syncPoolReserves(event, commitInbox);
              },
              Pool_TargetReached: async (event, commitInbox) => {
                await poolService.syncPoolTargetReached(event, commitInbox);
              },
            },
          },
        ]),
      ),
    });
  }
}
