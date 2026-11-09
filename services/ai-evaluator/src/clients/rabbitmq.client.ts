import { BaseRabbitMQClient } from '@shared/rabbitmq/src/baseRabbitmq.client';

export class RabbitMQClient extends BaseRabbitMQClient {
  constructor(uri: string) {
    super(uri, 'ai-evaluator');
  }

  getEvaluationRequestsExchange() {
    return 'evaluation.requests';
  }

  getEvaluationResultsExchange() {
    return 'evaluation.results';
  }

  getEvaluationRequestsQueue() {
    return 'evaluation.requests';
  }

  getTopologyDefinition() {
    return {
      exchanges: {
        [this.getEvaluationRequestsExchange()]: {
          type: 'direct' as const,
          options: { durable: true },
          allowUnrouted: false,
        },
        [this.getEvaluationResultsExchange()]: {
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
            [this.getEvaluationRequestsExchange()]: ['evaluate'],
          },
        },
      },
    };
  }
}
