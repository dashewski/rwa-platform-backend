import { BaseRabbitMQClient } from '@shared/rabbitmq/src/baseRabbitmq.client';

export class RabbitMQClient extends BaseRabbitMQClient {
  constructor(uri: string, private readonly chainIds: string[]) {
    super(uri, 'portfolio');
  }

  getBlockchainEventsExchange(chainId: string) {
    return `blockchain.${chainId}.events`;
  }

  getBlockchainEventsQueue(chainId: string) {
    return `blockchain.${chainId}.events.portfolio`;
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
            bindings: { [this.getBlockchainEventsExchange(chainId)]: ['RWA_Transfer'] },
          },
        ]),
      ),
    };
  }
}
