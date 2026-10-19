import { BaseRabbitMQClient } from '@shared/rabbitmq/src/baseRabbitmq.client';

export class RabbitMQClient extends BaseRabbitMQClient {
  constructor(uri: string) {
    super(uri, 'charts');
  }

  getTopologyDefinition() {
    return {
      exchanges: {
        'blockchain.events': { type: 'direct', options: { durable: true } },
      },
      queues: {
        'blockchain.events.charts': {
          options: { durable: true },
          deferAfterAttempts: Number.POSITIVE_INFINITY,
          parkAfterCycles: Number.POSITIVE_INFINITY,
          bindings: {
            'blockchain.events': ['Pool_ReservesUpdated', 'Pool_RwaMinted', 'Pool_RwaBurned'],
          },
        },
      },
    } as const;
  }
}
