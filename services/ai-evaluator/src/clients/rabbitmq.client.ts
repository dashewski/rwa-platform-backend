import { BaseRabbitMQClient } from '@shared/rabbitmq/src/baseRabbitmq.client';

export class RabbitMQClient extends BaseRabbitMQClient {
  constructor(uri: string) {
    super(uri, 'ai-evaluator');
  }

  getTopologyDefinition() {
    return {
      exchanges: {
        'evaluation': { type: 'direct', options: { durable: true } },
      },
      queues: {},
    } as const;
  }
}
