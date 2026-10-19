import { BaseRabbitMQClient } from '@shared/rabbitmq/src/baseRabbitmq.client';

export class RabbitMQClient extends BaseRabbitMQClient {
  constructor(uri: string) {
    super(uri, 'blockchain-scanner');
  }

  getTopologyDefinition() {
    return {
      exchanges: {
        'blockchain.events': { type: 'direct', options: { durable: true } },
      },
      queues: {},
    } as const;
  }
}
