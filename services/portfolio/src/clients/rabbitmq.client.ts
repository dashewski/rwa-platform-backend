import { BaseRabbitMQClient } from '@shared/rabbitmq/src/baseRabbitmq.client';

export class RabbitMQClient extends BaseRabbitMQClient {
  constructor(uri: string) {
    super(uri, 'portfolio');
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
        'blockchain.events.portfolio': {
          options: { durable: true },
          deferAfterAttempts: Number.POSITIVE_INFINITY,
          parkAfterCycles: Number.POSITIVE_INFINITY,
          bindings: {
            'blockchain.events': ['RWA_Transfer'],
          },
        },
      },
    } as const;
  }
}
