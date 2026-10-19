import { BaseRabbitMQClient } from '@shared/rabbitmq/src/baseRabbitmq.client';

export class RabbitMQClient extends BaseRabbitMQClient {
  constructor(uri: string) {
    super(uri, 'loyalty');
  }

  getTopologyDefinition() {
    return {
      exchanges: {
        'blockchain.events': { type: 'direct', options: { durable: true } },
      },
      queues: {
        'blockchain.events.loyalty': {
          options: { durable: true },
          deferAfterAttempts: Number.POSITIVE_INFINITY,
          parkAfterCycles: Number.POSITIVE_INFINITY,
          bindings: {
            'blockchain.events': [
              'Factory_CreateRWAFeeCollected',
              'Factory_CreatePoolFeeCollected',
              'Pool_RwaMinted',
              'Pool_RwaBurned',
              'ReferralTreasury_Withdrawn',
            ],
          },
        },
      },
    } as const;
  }
}
