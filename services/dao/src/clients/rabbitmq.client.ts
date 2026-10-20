import { BaseRabbitMQClient } from '@shared/rabbitmq/src/baseRabbitmq.client';

export class RabbitMQClient extends BaseRabbitMQClient {
  constructor(uri: string) {
    super(uri, 'dao');
  }

  getTopologyDefinition() {
    return {
      exchanges: {
        'blockchain.events': {
          type: 'direct',
          options: { durable: true },
          allowUnrouted: true,
        },
      },
      queues: {
        'blockchain.events.dao': {
          options: { durable: true },
          deferAfterAttempts: Number.POSITIVE_INFINITY,
          parkAfterCycles: Number.POSITIVE_INFINITY,
          bindings: {
            'blockchain.events': [
              'Governance_ProposalCreated',
              'Governance_ProposalExecuted',
              'Governance_ProposalCancelled',
              'Governance_VoteCast',
              'DaoStaking_TokensStaked',
              'DaoStaking_TokensUnstaked',
              'DaoStaking_TokensLocked',
              'Timelock_TransactionQueued',
              'Timelock_TransactionExecuted',
              'Timelock_TransactionCancelled',
              'Treasury_Withdrawal',
            ],
          },
        },
      },
    } as const;
  }
}
