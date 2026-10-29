import { BaseRabbitMQClient } from '@shared/rabbitmq/src/baseRabbitmq.client';

export class RabbitMQClient extends BaseRabbitMQClient {
  constructor(uri: string) {
    super(uri, 'ai-evaluator');
  }

  getEvaluationExchange() {
    return 'evaluation';
  }

  getEvaluationRequestsQueue() {
    return 'evaluation.requests';
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
      queues: {
        [this.getEvaluationRequestsQueue()]: {
          options: { durable: true },
          deferAfterAttempts: 3,
          parkAfterCycles: 3,
          bindings: {
            [this.getEvaluationExchange()]: ['evaluatePool', 'evaluateBusiness'],
          },
        },
      },
    };
  }
}
