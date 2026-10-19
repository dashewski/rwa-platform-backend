import { BaseRabbitMQClient } from '@shared/rabbitmq/src/baseRabbitmq.client';

export class RabbitMQClient extends BaseRabbitMQClient {
  constructor(uri: string) {
    super(uri, 'rwa');
  }

  getTopologyDefinition() {
    return {
      exchanges: {
        'blockchain.events': { type: 'direct', options: { durable: true } },
        evaluation: { type: 'direct', options: { durable: true } },
      },
      queues: {
        'blockchain.events.rwa': {
          options: { durable: true },
          deferAfterAttempts: Number.POSITIVE_INFINITY,
          parkAfterCycles: Number.POSITIVE_INFINITY,
          bindings: {
            'blockchain.events': [
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
        'evaluation.results': {
          options: { durable: true },
          deferAfterAttempts: 3,
          parkAfterCycles: 3,
          bindings: {
            evaluation: ['poolResult', 'businessResult'],
          },
        },
      },
    } as const;
  }
}
