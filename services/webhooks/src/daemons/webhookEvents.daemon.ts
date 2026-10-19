import type { ConsumeMessage } from 'amqplib';
import { RabbitMQClient } from '@shared/rabbitmq/src/rabbitmq.client';
import { ReliableConsumer, done, type ConsumeOutcome } from '@shared/rabbitmq/src/reliableConsumer';
import { WEBHOOK_EVENTS_QUEUE } from '../clients/webhookEvents.client';
import { WebhookDeliveryClient } from '../clients/webhookDelivery.client';
import { WebhookService } from '../services/webhook.service';
import { DeliveryService } from '../services/delivery.service';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import { MetricsDecorator } from '@shared/monitoring/src/metricsDecorator';
import { LogDecorator } from '@shared/monitoring/src/logDecorator';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { metrics } from '@shared/monitoring/src/metrics';

interface WebhookEventMessage {
  id: string;
  type: string;
  timestamp: number;
  payload: unknown;
}

/** A unique-index conflict: this endpoint's delivery log already exists. */
const isDuplicateKeyError = (error: unknown): boolean => {
  const e = error as { code?: unknown; message?: unknown };
  return e?.code === 11000 || e?.code === '11000' || /E11000/.test(String(e?.message ?? ''));
};

export class WebhookEventsDaemon {
  private readonly reliableConsumer: ReliableConsumer;

  constructor(
    rabbitMQClient: RabbitMQClient,
    private readonly webhookDeliveryClient: WebhookDeliveryClient,
    private readonly webhookService: WebhookService,
    private readonly deliveryService: DeliveryService,
  ) {
    this.reliableConsumer = new ReliableConsumer(rabbitMQClient, WEBHOOK_EVENTS_QUEUE, {
      // One immediate redelivery, then the event is parked in the queue's DLQ
      // (a persistent failure would spin on the same message forever).
      retry: { mode: 'immediate-once' },
      exhausted: 'park',
      park: { mode: 'dlx' },
      metricNames: {
        retried: 'webhook_events_retried_total',
        parked: 'webhook_events_parked_total',
      },
    });
  }

  @TraceDecorator()
  async initialize(): Promise<void> {
    await this.reliableConsumer.consume((message) => this.handleEvent(message));
    logger.info('Webhook events daemon initialized, consuming from webhooks.events.webhooks queue');
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ routingKey: a[0]?.fields?.routingKey }),
  })
  private async handleEvent(message: ConsumeMessage): Promise<ConsumeOutcome | void> {
    const event: WebhookEventMessage = JSON.parse(message.content.toString());
    metrics.counter('webhook_events_received_total', { type: event.type });

    // Find endpoints subscribed to this event type
    const endpoints = await this.webhookService.findEndpointsByEvent(event.type);

    if (endpoints.length === 0) {
      // No subscribers, nothing to do
      return done;
    }

    let failed = false;

    for (const endpoint of endpoints) {
      // One failing subscriber must not stop the others: errors are isolated
      // per endpoint and reported for the whole message at the end.
      try {
        await this.enqueueDelivery(endpoint, event);
      } catch (error: any) {
        if (isDuplicateKeyError(error)) {
          // The event was already enqueued for this endpoint (redelivery
          // after a crash): at-least-once, skip instead of failing the batch.
          logger.debug('Delivery already enqueued, skipping endpoint', {
            endpointId: endpoint._id.toString(),
            eventId: event.id,
          });
          continue;
        }

        failed = true;
        logger.error('Failed to enqueue delivery', {
          endpointId: endpoint._id.toString(),
          eventId: event.id,
          error,
        });
      }
    }

    if (failed) {
      // The reliability contract redelivers the event once and then parks it.
      return { kind: 'retry' };
    }

    return done;
  }

  /**
   * Checks the breaker/rate limit and enqueues one delivery (log first) for a
   * single endpoint. Skips are not failures: the event is still acked.
   */
  private async enqueueDelivery(endpoint: any, event: WebhookEventMessage): Promise<void> {
    // Check if endpoint is active (circuit breaker)
    const isActive = await this.webhookService.isEndpointActive(endpoint._id.toString());
    if (!isActive) {
      logger.warn('Endpoint is inactive, skipping', { endpointId: endpoint._id.toString() });
      return;
    }

    // Check rate limit
    const withinLimit = await this.webhookService.checkRateLimit(endpoint._id.toString(), endpoint.rateLimitPerMinute);
    if (!withinLimit) {
      logger.warn('Rate limit exceeded, skipping', { endpointId: endpoint._id.toString() });
      return;
    }

    // Create delivery log
    const deliveryLogId = await this.deliveryService.createDeliveryLog({
      endpointId: endpoint._id.toString(),
      eventType: event.type,
      eventId: event.id,
      payload: event.payload,
    });

    // Enqueue delivery
    await this.webhookDeliveryClient.sendToDeliveryQueue({
      endpointId: endpoint._id.toString(),
      eventId: event.id,
      eventType: event.type,
      payload: event.payload,
      attempt: 0,
      maxAttempts: endpoint.maxAttempts,
      url: endpoint.url,
      secret: endpoint.secret,
      deliveryLogId,
    });
  }
}
