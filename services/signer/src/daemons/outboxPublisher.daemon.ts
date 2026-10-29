import { BaseOutboxPublisherDaemon } from '@shared/outbox-publisher';
import type { OutboxPublisherService } from '@shared/outbox-publisher';
import type { RabbitMQClient } from '../clients/rabbitmq.client';

export class OutboxPublisherDaemon extends BaseOutboxPublisherDaemon {
  constructor(publisherService: OutboxPublisherService, rabbitClient: RabbitMQClient) {
    super(publisherService, 500, {
      [rabbitClient.getSignExchange()]: {
        isSync: false,
        concurrency: 5,
        maxAttempts: 5,
      },
    });
  }
}
