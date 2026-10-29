import { BaseRabbitMQClient } from '@shared/rabbitmq/src/baseRabbitmq.client';

export class RabbitMQClient extends BaseRabbitMQClient {
  constructor(uri: string, private readonly chainIds: string[]) {
    super(uri, 'rwa');
  }

  getEvaluationExchange() {
    return 'evaluation';
  }

  getEvaluationResultsQueue() {
    return 'evaluation.results';
  }

  getBlockchainEventsExchange(chainId: string) {
    return `blockchain.${chainId}.events`;
  }

  getBlockchainEventsQueue(chainId: string) {
    return `blockchain.${chainId}.events.rwa`;
  }

  getBlockchainEventsQueues() {
    return this.chainIds.map((chainId) => this.getBlockchainEventsQueue(chainId));
  }

  getTopologyDefinition() {
    return {
      exchanges: {
        [this.getEvaluationExchange()]: {
          type: 'direct' as const,
          options: { durable: true },
          allowUnrouted: false,
        },
        ...Object.fromEntries(
          this.chainIds.map((chainId) => [
            this.getBlockchainEventsExchange(chainId),
            { type: 'direct' as const, options: { durable: true }, allowUnrouted: true },
          ]),
        ),
      },
      queues: {
        [this.getEvaluationResultsQueue()]: {
          options: { durable: true },
          deferAfterAttempts: 3,
          parkAfterCycles: 3,
          bindings: {
            [this.getEvaluationExchange()]: ['poolResult', 'businessResult'],
          },
        },
        ...Object.fromEntries(
          this.chainIds.map((chainId) => [
            this.getBlockchainEventsQueue(chainId),
            {
              options: { durable: true },
              deferAfterAttempts: Number.POSITIVE_INFINITY,
              parkAfterCycles: Number.POSITIVE_INFINITY,
              bindings: {
                [this.getBlockchainEventsExchange(chainId)]: [
                  'RWA_Deployed',
                  'RWA_PausedStateChanged',
                  'Pool_Deployed',
                  'Pool_BonusWithdrawn',
                  'Pool_AwaitingRwaAmountUpdated',
                  'Pool_FundsFullyReturned',
                  'Pool_IncomingReturnSummary',
                  'Pool_IncomingTrancheUpdate',
                  'Pool_OutgoingClaimSummary',
                  'Pool_OutgoingTrancheClaimed',
                  'Pool_PausedStateChanged',
                  'Pool_ReservesUpdated',
                  'Pool_TargetReached',
                ],
              },
            },
          ]),
        ),
      },
    };
  }
}
