import { BaseRabbitMQClient } from '@shared/rabbitmq/src/baseRabbitmq.client';

export class RabbitMQClient extends BaseRabbitMQClient {
  constructor(uri: string, signerName: string) {
    super(uri, signerName);
  }

  getSignExchange() {
    return 'sign.exchange';
  }

  getSignRequestsQueue() {
    return `sign.requests.${this.channelName}`;
  }

  getTopologyDefinition() {
    return {
      exchanges: {
        [this.getSignExchange()]: {
          type: 'direct' as const,
          options: { durable: true },
          allowUnrouted: false,
        },
      },
      queues: {
        [this.getSignRequestsQueue()]: {
          options: { durable: true },
          deferAfterAttempts: 3,
          parkAfterCycles: 3,
          bindings: {
            [this.getSignExchange()]: ['task'],
          },
        },
      },
    };
  }
}
