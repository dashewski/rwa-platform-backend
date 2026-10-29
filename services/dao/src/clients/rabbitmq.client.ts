import { BaseRabbitMQClient } from '@shared/rabbitmq/src/baseRabbitmq.client';

export class RabbitMQClient extends BaseRabbitMQClient {
  constructor(uri: string, private readonly chainIds: string[]) {
    super(uri, 'dao');
  }

  getBlockchainEventsExchange(chainId: string) {
    return `blockchain.${chainId}.events`;
  }

  getBlockchainEventsQueue(chainId: string) {
    return `blockchain.${chainId}.events.dao`;
  }

  getBlockchainEventsQueues() {
    return this.chainIds.map((chainId) => this.getBlockchainEventsQueue(chainId));
  }

  getTopologyDefinition() {
    return {
      exchanges: Object.fromEntries(
        this.chainIds.map((chainId) => [
          this.getBlockchainEventsExchange(chainId),
          { type: 'direct' as const, options: { durable: true }, allowUnrouted: true },
        ]),
      ),
      queues: Object.fromEntries(
        this.chainIds.map((chainId) => [
          this.getBlockchainEventsQueue(chainId),
          {
            options: { durable: true },
            deferAfterAttempts: Number.POSITIVE_INFINITY,
            parkAfterCycles: Number.POSITIVE_INFINITY,
            bindings: {
              [this.getBlockchainEventsExchange(chainId)]: [
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
        ]),
      ),
    };
  }
}
