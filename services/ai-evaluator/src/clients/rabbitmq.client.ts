import { BaseRabbitMQClient } from '@shared/rabbitmq/src/baseRabbitmq.client';

export class RabbitMQClient extends BaseRabbitMQClient {
  constructor(uri: string) {
    super(uri, 'ai-evaluator');
  }

  getEvaluationExchange() {
    return 'evaluation';
  }

  getTopologyDefinition() {
    return {
      exchanges: {
        [this.getEvaluationExchange()]: {
          type: 'direct' as const,
          options: { durable: true },
          allowUnrouted: false,
        },
      },
      queues: {},
    };
  }
}
