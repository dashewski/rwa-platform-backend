import { BaseOutboxPublisherDaemon } from '@shared/outbox-publisher';
import type { OutboxPublisherService } from '@shared/outbox-publisher';
import type { RabbitMQClient } from '../clients/rabbitmq.client';


export class OutboxPublisherDaemon extends BaseOutboxPublisherDaemon<RabbitMQClient> {
  constructor(publisherService: OutboxPublisherService) {
    super(publisherService, 500, {
      'blockchain.events': {
        isSync: true,
        concurrency: 1,
        maxAttempts: Number.POSITIVE_INFINITY
      },
    });
  }
}
