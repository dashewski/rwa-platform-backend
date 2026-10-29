import { BaseRabbitMQClient } from '@shared/rabbitmq/src/baseRabbitmq.client';

export class RabbitMQClient extends BaseRabbitMQClient {
  constructor(uri: string) {
    super(uri, 'signers-manager');
  }

  getSignExchange() {
    return 'sign.exchange';
  }

  getSignResponsesQueue() {
    return 'sign.responses';
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
        [this.getSignResponsesQueue()]: {
          options: { durable: true },
          deferAfterAttempts: 3,
          parkAfterCycles: 3,
          bindings: {
            [this.getSignExchange()]: ['response'],
          },
        },
      },
    };
  }
}
