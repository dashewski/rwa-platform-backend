import { BaseRabbitMQClient } from '@shared/rabbitmq/src/baseRabbitmq.client';

export class RabbitMQClient extends BaseRabbitMQClient {
  constructor(uri: string, private readonly chainId: string) {
    super(uri, 'blockchain-scanner');
  }

  getBlockchainEventsExchange() {
    return `blockchain.${this.chainId}.events`;
  }

  getTopologyDefinition() {
    return {
      exchanges: {
        [this.getBlockchainEventsExchange()]: {
          type: 'direct' as const,
          options: { durable: true },
          allowUnrouted: true,
        },
      },
      queues: {},
    };
  }
}
