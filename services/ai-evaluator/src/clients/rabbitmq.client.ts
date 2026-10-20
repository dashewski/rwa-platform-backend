import { BaseRabbitMQClient } from '@shared/rabbitmq/src/baseRabbitmq.client';

export class RabbitMQClient extends BaseRabbitMQClient {
  constructor(uri: string) {
    super(uri, 'ai-evaluator');
  }

  getTopologyDefinition() {
    return {
      exchanges: {
        evaluation: { type: 'direct', options: { durable: true } },
      },
      queues: {
        'evaluation.requests': {
          options: { durable: true },
          deferAfterAttempts: 3,
          parkAfterCycles: 3,
          bindings: {
            evaluation: ['evaluatePool', 'evaluateBusiness'],
          },
        },
      },
    } as const;
  }
}
