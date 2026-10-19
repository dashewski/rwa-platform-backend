import { BaseRabbitMQClient } from '@shared/rabbitmq/src/baseRabbitmq.client';

export class RabbitMQClient extends BaseRabbitMQClient {
  constructor(uri: string) {
    super(uri, 'signers-manager');
  }

  getTopologyDefinition() {
    return {
      exchanges: {
        'sign.exchange': { type: 'direct', options: { durable: true } },
      },
      queues: {
        'sign.responses': {
          options: { durable: true, arguments: { 'x-message-ttl': 3_600_000 } },
          deferAfterAttempts: 3,
          parkAfterCycles: 3,
          bindings: {
            'sign.exchange': ['response'],
          },
        },
      },
    } as const;
  }
}
