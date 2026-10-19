/**
 * Unit tests for WebhookEventsDaemon.
 *
 * Scope: the daemon layer. The daemon is wired to the real WebhookService and
 * DeliveryService with in-memory repositories, a fake Redis client and the fake
 * RabbitMQ client (tests/fakes/*.fake.ts). The reliability contract registers
 * its consumer on the fake broker; tests invoke that handler with synthetic
 * amqplib-shaped messages (content Buffer, fields, redelivered) and assert the
 * resulting ack/nack decisions on the same fake broker. No database, no
 * broker, no network.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { WebhookEventsDaemon } from '../src/daemons/webhookEvents.daemon';
import { WEBHOOK_EVENTS_QUEUE } from '../src/clients/webhookEvents.client';
import { WebhookService } from '../src/services/webhook.service';
import { DeliveryService } from '../src/services/delivery.service';
import type { EndpointRepository } from '../src/repositories/endpoint.repository';
import type { DeliveryLogRepository } from '../src/repositories/deliveryLog.repository';
import type { RedisWithTracing } from '@shared/monitoring/src/redis';
import { createFakeEndpointRepository, type FakeEndpointRepository } from './fakes/endpoint.repository.fake';
import { createFakeDeliveryLogRepository, type FakeDeliveryLogRepository } from './fakes/deliveryLog.repository.fake';
import { createFakeRedisClient, type FakeRedisClient } from './fakes/redis.client.fake';
import { createFakeRabbitMQClient, type FakeRabbitMQClient } from './fakes/rabbitmq.client.fake';
import { createFakeWebhookDeliveryClient, type FakeWebhookDeliveryClient } from './fakes/webhookDelivery.client.fake';
import { createSyntheticMessage } from './fakes/consumerMessage.fake';

const ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

const EVENT = {
  id: 'evt-1',
  type: 'pool.deployed',
  timestamp: 1766000000000,
  payload: { poolId: 'pool-1', amount: '100' },
};

describe('WebhookEventsDaemon (unit, fake broker and repositories)', () => {
  let endpoints: FakeEndpointRepository;
  let logs: FakeDeliveryLogRepository;
  let redis: FakeRedisClient;
  let rabbit: FakeRabbitMQClient;
  let deliveryClient: FakeWebhookDeliveryClient;
  let daemon: WebhookEventsDaemon;
  let journal: string[];
  let handler: ((msg: any) => Promise<void>) | null;

  beforeEach(async () => {
    endpoints = createFakeEndpointRepository();
    logs = createFakeDeliveryLogRepository();
    redis = createFakeRedisClient();
    journal = [];
    rabbit = createFakeRabbitMQClient(journal);
    deliveryClient = createFakeWebhookDeliveryClient(journal);

    const webhookService = new WebhookService(
      endpoints as unknown as EndpointRepository,
      redis as unknown as RedisWithTracing,
      ENCRYPTION_KEY,
    );
    const deliveryService = new DeliveryService(
      logs as unknown as DeliveryLogRepository,
      endpoints as unknown as EndpointRepository,
      redis as unknown as RedisWithTracing,
      ENCRYPTION_KEY,
    );

    daemon = new WebhookEventsDaemon(rabbit as any, deliveryClient as any, webhookService, deliveryService);
    await daemon.initialize();
    handler = rabbit.handlers.get(WEBHOOK_EVENTS_QUEUE) ?? null;
    journal.length = 0; // drop the consume entry recorded by initialize()
  });

  async function seedEndpoint(overrides: Record<string, unknown> = {}) {
    const created = await endpoints.createEndpoint({
      userId: 'user-1',
      wallet: '0xAbC0000000000000000000000000000000000001',
      url: 'https://8.8.8.8/hooks',
      secret: 'encrypted-at-rest',
      events: ['pool.deployed'],
    });
    Object.assign(created as any, overrides);
    return created;
  }

  test('initialize: consumes the events queue with manual acknowledgements', async () => {
    expect(rabbit.consume).toHaveBeenCalledTimes(1);
    expect(rabbit.consume.mock.calls[0][0]).toBe(WEBHOOK_EVENTS_QUEUE);
    expect(rabbit.consume.mock.calls[0][2]).toEqual({ noAck: false });
    expect(typeof handler).toBe('function');
  });

  test('handler: acks an event that no endpoint subscribes to', async () => {
    await seedEndpoint({ events: ['business.deployed'] });

    const message = createSyntheticMessage(EVENT);
    await handler!(message);

    expect(endpoints.findByEvents).toHaveBeenCalledWith('pool.deployed');
    expect(rabbit.acked).toEqual([message]);
    expect(rabbit.nacked).toHaveLength(0);
    expect(logs.createDeliveryLog).toHaveBeenCalledTimes(0);
    expect(deliveryClient.sendToDeliveryQueue).toHaveBeenCalledTimes(0);
  });

  test('handler: enqueues one delivery per active subscriber and acks the event', async () => {
    const first = await seedEndpoint({ userId: 'user-1' });
    const second = await seedEndpoint({ userId: 'user-2', url: 'https://9.9.9.9/hooks', secret: 'encrypted-second' });

    const message = createSyntheticMessage(EVENT);
    await handler!(message);

    expect(logs.createDeliveryLog).toHaveBeenCalledTimes(2);
    expect(deliveryClient.sendToDeliveryQueue).toHaveBeenCalledTimes(2);

    const sent = deliveryClient.sentMessages;
    expect(sent.map((entry) => entry.endpointId)).toEqual([first._id.toString(), second._id.toString()]);
    for (const entry of sent) {
      expect(entry.eventId).toBe(EVENT.id);
      expect(entry.eventType).toBe(EVENT.type);
      expect(entry.payload).toEqual(EVENT.payload);
      expect(entry.attempt).toBe(0); // first delivery attempt
      expect(entry.maxAttempts).toBe(8); // model default
      expect(typeof entry.deliveryLogId).toBe('string');
      // Every enqueued delivery has a pending log of its own.
      expect(logs.store.get(entry.deliveryLogId)!.status).toBe('pending');
      expect(logs.store.get(entry.deliveryLogId)!.endpointId.toString()).toBe(entry.endpointId);
    }
    expect(sent[0].url).toBe('https://8.8.8.8/hooks');
    expect(sent[0].secret).toBe('encrypted-at-rest');

    expect(rabbit.acked).toEqual([message]);
    expect(rabbit.nacked).toHaveLength(0);
    // The event is acked only after every delivery has been enqueued.
    expect(journal).toEqual(['sendToDeliveryQueue', 'sendToDeliveryQueue', 'ack']);
  });

  test('handler: skips an endpoint whose breaker key is set in Redis but still acks', async () => {
    const endpoint = await seedEndpoint();
    await redis.set(`webhook:endpoint:${endpoint._id.toString()}:active`, '0');

    const message = createSyntheticMessage(EVENT);
    await handler!(message);

    expect(logs.createDeliveryLog).toHaveBeenCalledTimes(0);
    expect(deliveryClient.sendToDeliveryQueue).toHaveBeenCalledTimes(0);
    expect(rabbit.acked).toEqual([message]);
  });

  test('handler: skips an endpoint deactivated after the subscription lookup', async () => {
    // findByEvents filters active:true, so the race where an endpoint is
    // deactivated between the lookup and the breaker check is simulated by
    // returning the now-inactive document straight from the fake.
    const endpoint = await seedEndpoint({ active: false });
    endpoints.findByEvents.mockImplementationOnce(async () => [endpoint]);

    const message = createSyntheticMessage(EVENT);
    await handler!(message);

    expect(logs.createDeliveryLog).toHaveBeenCalledTimes(0);
    expect(deliveryClient.sendToDeliveryQueue).toHaveBeenCalledTimes(0);
    expect(rabbit.acked).toEqual([message]);
  });

  test('handler: skips an endpoint that exceeded its rate limit', async () => {
    const endpoint = await seedEndpoint({ rateLimitPerMinute: 10 });
    const rateLimitKey = `webhook:endpoint:${endpoint._id.toString()}:rl`;
    await redis.set(rateLimitKey, '10'); // the next incr is hit 11 > limit 10

    const message = createSyntheticMessage(EVENT);
    await handler!(message);

    expect(redis.incr).toHaveBeenCalledWith(rateLimitKey);
    expect(redis.expire).toHaveBeenCalledTimes(0); // TTL is only set on the first hit of a window
    expect(logs.createDeliveryLog).toHaveBeenCalledTimes(0);
    expect(deliveryClient.sendToDeliveryQueue).toHaveBeenCalledTimes(0);
    expect(rabbit.acked).toEqual([message]);
  });

  test('handler: delivers when Redis rate limiting fails open', async () => {
    await seedEndpoint();
    redis.incr.mockImplementationOnce(async () => {
      throw new Error('redis down');
    });

    const message = createSyntheticMessage(EVENT);
    await handler!(message);

    expect(deliveryClient.sendToDeliveryQueue).toHaveBeenCalledTimes(1);
    expect(rabbit.acked).toEqual([message]);
  });

  test('handler: ignores a null delivery', async () => {
    await handler!(null);

    expect(rabbit.acked).toHaveLength(0);
    expect(rabbit.nacked).toHaveLength(0);
    expect(logs.createDeliveryLog).toHaveBeenCalledTimes(0);
  });

  test('handler: a failing subscriber does not stop the others and earns one redelivery', async () => {
    await seedEndpoint({ userId: 'user-1' });
    const second = await seedEndpoint({ userId: 'user-2', url: 'https://9.9.9.9/hooks', secret: 'encrypted-second' });
    deliveryClient.sendToDeliveryQueue.mockImplementationOnce(async () => {
      throw new Error('rabbit hiccup');
    });

    const message = createSyntheticMessage(EVENT);
    await handler!(message);

    // The second subscriber still got its delivery …
    expect(deliveryClient.sendToDeliveryQueue).toHaveBeenCalledTimes(2);
    expect(deliveryClient.sentMessages.at(-1)!.endpointId).toBe(second._id.toString());
    // … and the event is requeued once instead of being dropped silently.
    expect(rabbit.nacked).toHaveLength(1);
    expect(rabbit.nacked[0].message).toBe(message);
    expect(rabbit.nacked[0].requeue).toBe(true);
    expect(rabbit.acked).toHaveLength(0);
  });

  test('handler: parks the event when the redelivered attempt fails again', async () => {
    await seedEndpoint();
    deliveryClient.sendToDeliveryQueue.mockImplementation(async () => {
      throw new Error('mongo down');
    });

    const message = createSyntheticMessage(EVENT, { redelivered: true });
    await handler!(message);

    expect(rabbit.nacked).toHaveLength(1);
    expect(rabbit.nacked[0].message).toBe(message);
    expect(rabbit.nacked[0].requeue).toBe(false); // → DLQ
  });

  test('handler: a duplicate delivery log (redelivery) is treated as already enqueued', async () => {
    await seedEndpoint();
    // Mongo raises 11000 when the (endpointId, eventId) unique index collides:
    // the previous attempt already created the log and enqueued the delivery.
    logs.createDeliveryLog.mockImplementationOnce(async () => {
      throw Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
    });

    const message = createSyntheticMessage(EVENT);
    await handler!(message);

    expect(deliveryClient.sendToDeliveryQueue).toHaveBeenCalledTimes(0);
    expect(rabbit.acked).toEqual([message]);
    expect(rabbit.nacked).toHaveLength(0);
  });

  test('handler: nacks with requeue once for a malformed message, then parks it', async () => {
    const message = createSyntheticMessage('{not json');
    await handler!(message);

    expect(rabbit.nacked).toHaveLength(1);
    expect(rabbit.nacked[0].message).toBe(message);
    expect(rabbit.nacked[0].requeue).toBe(true);
    expect(rabbit.acked).toHaveLength(0);

    const redelivered = createSyntheticMessage('{not json', { redelivered: true });
    await handler!(redelivered);

    expect(rabbit.nacked).toHaveLength(2);
    expect(rabbit.nacked[1].message).toBe(redelivered);
    expect(rabbit.nacked[1].requeue).toBe(false); // → DLQ
  });

  test('handler: nacks with requeue once when the subscription lookup fails, then parks', async () => {
    endpoints.findByEvents.mockImplementationOnce(async () => {
      throw new Error('mongo down');
    });

    const message = createSyntheticMessage(EVENT);
    await handler!(message);

    expect(rabbit.nacked).toHaveLength(1);
    expect(rabbit.nacked[0].message).toBe(message);
    expect(rabbit.nacked[0].requeue).toBe(true);
    expect(rabbit.acked).toHaveLength(0);

    endpoints.findByEvents.mockImplementationOnce(async () => {
      throw new Error('mongo down');
    });
    const redelivered = createSyntheticMessage(EVENT, { redelivered: true });
    await handler!(redelivered);

    expect(rabbit.nacked).toHaveLength(2);
    expect(rabbit.nacked[1].message).toBe(redelivered);
    expect(rabbit.nacked[1].requeue).toBe(false); // → DLQ
  });

  test('handler: oversized events are enqueued as-is; the DeliveryService dead-letters them', async () => {
    await seedEndpoint();

    // The daemon does not size-check anymore (it used to log "truncating"
    // without truncating): the single enforcement point is the DeliveryService,
    // which dead-letters oversized payloads without touching the endpoint.
    const payload = { blob: 'x'.repeat(256 * 1024) + 'x' };
    const message = createSyntheticMessage({ ...EVENT, payload });
    await handler!(message);

    expect(logs.createDeliveryLog).toHaveBeenCalledTimes(1);
    expect(deliveryClient.sendToDeliveryQueue).toHaveBeenCalledTimes(1);
    expect(deliveryClient.sentMessages[0].payload).toEqual(payload);
    expect(rabbit.acked).toEqual([message]);
  });
});
