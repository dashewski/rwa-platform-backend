import { BaseRabbitMQClient } from '@shared/rabbitmq/src/baseRabbitmq.client';

export class RabbitMQClient extends BaseRabbitMQClient {
  constructor(uri: string, signerName: string) {
    super(uri, signerName);
  }

  getTopologyDefinition() {
    return {
      exchanges: {
        'sign.exchange': { type: 'direct', options: { durable: true } },
      },
      queues: {
        [`sign.requests.${this.channelName}`]: {
          options: { durable: true },
          deferAfterAttempts: 3,
          parkAfterCycles: 3,
          bindings: {
            'sign.exchange': ['task'],
          },
        },
      },
    } as const;
  }
}
