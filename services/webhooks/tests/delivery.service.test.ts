/**
 * Unit tests for DeliveryService.
 *
 * Scope: the service layer only. Both repositories and the Redis client are
 * replaced with in-memory fakes, and the global `fetch` (the HTTP delivery
 * client of src) is replaced with tests/fakes/fetch.fake.ts. No database, no
 * broker, no network. Run with `bun test` from services/webhooks.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import crypto from 'crypto';
import { DeliveryService } from '../src/services/delivery.service';
import type { DeliveryLogRepository } from '../src/repositories/deliveryLog.repository';
import type { EndpointRepository } from '../src/repositories/endpoint.repository';
import type { RedisWithTracing } from '@shared/monitoring/src/redis';
import { createFakeDeliveryLogRepository, type FakeDeliveryLogRepository } from './fakes/deliveryLog.repository.fake';
import { createFakeEndpointRepository, type FakeEndpointRepository } from './fakes/endpoint.repository.fake';
import { createFakeRedisClient, type FakeRedisClient } from './fakes/redis.client.fake';
import { createFakeFetch, type FakeFetch } from './fakes/fetch.fake';
import { createSecretBox, type FakeSecretBox } from './fakes/secrets.fake';

const ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

// Standard Webhooks secret: `whsec_` + base64 of the raw key bytes.
const SECRET_KEY_BYTES = Buffer.alloc(32, 9);
const RAW_SECRET = `whsec_${SECRET_KEY_BYTES.toString('base64')}`;
const HOOK_URL = 'https://8.8.8.8/hooks';
const EVENT_ID = 'evt-1';
const LOG_ENDPOINT_ID = '507f1f77bcf86cd799439011';

type DeliverInput = Parameters<DeliveryService['deliverWebhook']>[0];

describe('DeliveryService (unit, fake repositories)', () => {
  let logs: FakeDeliveryLogRepository;
  let endpoints: FakeEndpointRepository;
  let redis: FakeRedisClient;
  let box: FakeSecretBox;
  let http: FakeFetch;
  let service: DeliveryService;

  let endpointId: string;
  let deliveryLogId: string;
  let encryptedSecret: string;

  beforeEach(async () => {
    logs = createFakeDeliveryLogRepository();
    endpoints = createFakeEndpointRepository();
    redis = createFakeRedisClient();
    box = createSecretBox(ENCRYPTION_KEY);
    http = createFakeFetch();
    http.install();

    service = new DeliveryService(
      logs as unknown as DeliveryLogRepository,
      endpoints as unknown as EndpointRepository,
      redis as unknown as RedisWithTracing,
      ENCRYPTION_KEY,
    );

    endpointId = await seedEndpoint();
    encryptedSecret = box.encrypt(RAW_SECRET);
    deliveryLogId = await service.createDeliveryLog({
      endpointId: LOG_ENDPOINT_ID,
      eventType: 'pool.deployed',
      eventId: EVENT_ID,
      payload: { hello: 'world' },
    });
  });

  afterEach(() => {
    http.restore();
  });

  async function seedEndpoint(overrides: Record<string, unknown> = {}): Promise<string> {
    const created = await endpoints.createEndpoint({
      userId: 'user-1',
      wallet: '0xAbC0000000000000000000000000000000000001',
      url: HOOK_URL,
      secret: 'encrypted-at-rest',
      events: ['pool.deployed'],
    });
    Object.assign(endpoints.store.get(created._id.toString())!, overrides);
    return created._id.toString();
  }

  function deliveryInput(overrides: Partial<DeliverInput> = {}): DeliverInput {
    return {
      endpointId,
      eventId: EVENT_ID,
      eventType: 'pool.deployed',
      payload: { hello: 'world' },
      attempt: 1,
      maxAttempts: 3,
      url: HOOK_URL,
      secret: encryptedSecret,
      deliveryLogId,
      ...overrides,
    };
  }

  test('createDeliveryLog: stores a pending log and returns its id', async () => {
    const id = await service.createDeliveryLog({
      endpointId: LOG_ENDPOINT_ID,
      eventType: 'pool.deployed',
      eventId: 'evt-2',
      payload: { amount: '100' },
    });

    expect(logs.createDeliveryLog).toHaveBeenCalledWith({
      endpointId: LOG_ENDPOINT_ID,
      eventType: 'pool.deployed',
      eventId: 'evt-2',
      payload: { amount: '100' },
      status: 'pending',
    });
    expect(id).toHaveLength(24); // Mongo ObjectId hex

    const doc = logs.store.get(id)!;
    expect(doc.status).toBe('pending');
    expect(doc.endpointId.toString()).toBe(LOG_ENDPOINT_ID);
    expect(doc.attempts).toEqual([]);
  });

  test('deliverWebhook: on 2xx it signs the request and records success', async () => {
    http.setResponse({ status: 200, body: 'ok' });

    const result = await service.deliverWebhook(deliveryInput({ attempt: 2 }));

    expect(result).toEqual({ success: true });

    expect(http.calls).toHaveLength(1);
    const { url, init } = http.calls[0];
    expect(url).toBe(HOOK_URL);
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('manual');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.body).toBe(JSON.stringify({ hello: 'world' }));

    // Standard Webhooks headers: webhook-id is stable across retries and is
    // the receiver's deduplication key.
    const headers = init.headers;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['webhook-id']).toBe(EVENT_ID);
    expect(headers['webhook-event']).toBe('pool.deployed');
    expect(Number(headers['webhook-timestamp'])).toBeGreaterThan(0);

    // HMAC-SHA256 over `<id>.<timestamp>.<body>`, base64, scheme version
    // prefix — the timestamp is inside the signature, so replays are visible.
    const expected = crypto
      .createHmac('sha256', SECRET_KEY_BYTES)
      .update(`${EVENT_ID}.${headers['webhook-timestamp']}.${init.body}`)
      .digest('base64');
    expect(headers['webhook-signature']).toBe(`v1,${expected}`);

    const [loggedId, successAttempt] = logs.pushAttempt.mock.calls[0] as [string, any];
    expect(loggedId).toBe(deliveryLogId);
    expect(successAttempt).toEqual({ timestamp: expect.any(Number), statusCode: 200 });
    expect(logs.updateStatus).toHaveBeenCalledWith(deliveryLogId, { status: 'delivered' });
  });

  test('deliverWebhook: signs with legacy (non-whsec_) secrets as raw UTF-8 bytes', async () => {
    const legacySecret = 'legacy-raw-secret';
    http.setResponse({ status: 200, body: 'ok' });

    await service.deliverWebhook(deliveryInput({ secret: box.encrypt(legacySecret) }));

    const { init } = http.calls[0];
    const expected = crypto
      .createHmac('sha256', Buffer.from(legacySecret, 'utf8'))
      .update(`${EVENT_ID}.${init.headers['webhook-timestamp']}.${init.body}`)
      .digest('base64');
    expect(init.headers['webhook-signature']).toBe(`v1,${expected}`);
  });

  test('deliverWebhook: dead-letters an oversized payload without calling the endpoint', async () => {
    const payload = { blob: 'x'.repeat(256 * 1024) + 'x' };

    const result = await service.deliverWebhook(deliveryInput({ payload }));

    expect(result).toEqual({ success: false, deadLetter: true });
    expect(http.calls).toHaveLength(0);

    const [, attempt] = logs.pushAttempt.mock.calls[0] as [string, any];
    expect(attempt).toMatchObject({ statusCode: 413, responseBody: '', error: 'Payload too large' });

    // The log says what actually happened; the endpoint is not deactivated —
    // the oversized payload is our side's problem, not the receiver's.
    expect(logs.updateStatus).toHaveBeenCalledWith(deliveryLogId, { status: 'dead_letter' });
    expect(endpoints.updateEndpoint).toHaveBeenCalledTimes(0);
    expect(redis.set).toHaveBeenCalledTimes(0);
  });

  for (const status of [0, 301, 302]) {
    test(`deliverWebhook: a ${status} redirect response dead-letters and deactivates the endpoint`, async () => {
      http.setResponse({ status });

      const result = await service.deliverWebhook(deliveryInput());

      expect(result).toEqual({ success: false, deadLetter: true });

      const [, attempt] = logs.pushAttempt.mock.calls[0] as [string, any];
      expect(attempt).toMatchObject({
        statusCode: status,
        responseBody: '',
        error: 'Redirects are not followed',
      });

      expect(endpoints.updateEndpoint).toHaveBeenCalledWith(endpointId, { active: false });
      expect(redis.set).toHaveBeenCalledWith(`webhook:endpoint:${endpointId}:active`, '0', 'EX', 3600);
      expect(logs.updateStatus).toHaveBeenCalledWith(deliveryLogId, { status: 'dead_letter' });
    });
  }

  for (const [url, label] of [
    ['https://10.13.13.13/hooks', 'RFC1918 address'],
    ['https://169.254.169.254/latest/meta-data', 'cloud metadata address'],
    ['https://[::1]/hooks', 'IPv6 loopback'],
  ] as const) {
    test(`deliverWebhook: a private destination (${label}) is dead-lettered without a request`, async () => {
      http.setResponse({ status: 200, body: 'nope' });

      const result = await service.deliverWebhook(deliveryInput({ url }));

      expect(result).toEqual({ success: false, deadLetter: true });
      expect(http.calls).toHaveLength(0); // the request never happens

      const [, attempt] = logs.pushAttempt.mock.calls[0] as [string, any];
      expect(attempt.responseBody).toBe('');
      expect(attempt.error).toBe('Hostname resolves to a private address (SSRF protection)');
      expect(attempt.statusCode).toBeUndefined();

      expect(logs.updateStatus).toHaveBeenCalledWith(deliveryLogId, { status: 'dead_letter' });
      expect(endpoints.updateEndpoint).toHaveBeenCalledWith(endpointId, { active: false });
      expect(redis.set).toHaveBeenCalledWith(`webhook:endpoint:${endpointId}:active`, '0', 'EX', 3600);
    });
  }

  test('deliverWebhook: an allowlisted host skips the private check and is delivered', async () => {
    // Dev stand only: the receiver on the Docker host resolves to a private
    // gateway address, but SSRF_ALLOWED_HOSTS exempts it from the blocklist.
    process.env.SSRF_ALLOWED_HOSTS = 'host.docker.internal';
    http.setResponse({ status: 200, body: 'ok' });
    try {
      const result = await service.deliverWebhook(deliveryInput({ url: 'https://host.docker.internal:4000/webhook' }));

      expect(result).toEqual({ success: true });
      expect(http.calls).toHaveLength(1);
      expect(http.calls[0].url).toBe('https://host.docker.internal:4000/webhook');
    } finally {
      delete process.env.SSRF_ALLOWED_HOSTS;
    }
  });

  for (const status of [400, 404, 410]) {
    test(`deliverWebhook: a ${status} response dead-letters, records the body and deactivates`, async () => {
      http.setResponse({ status, body: 'endpoint says no' });

      const result = await service.deliverWebhook(deliveryInput());

      expect(result).toEqual({ success: false, deadLetter: true });

      const [, attempt] = logs.pushAttempt.mock.calls[0] as [string, any];
      expect(attempt).toMatchObject({ statusCode: status, responseBody: 'endpoint says no', error: `HTTP ${status}` });

      expect(endpoints.updateEndpoint).toHaveBeenCalledWith(endpointId, { active: false });
      expect(redis.set).toHaveBeenCalledWith(`webhook:endpoint:${endpointId}:active`, '0', 'EX', 3600);
      expect(logs.updateStatus).toHaveBeenCalledWith(deliveryLogId, { status: 'dead_letter' });
    });
  }

  test('deliverWebhook: a 5xx below maxAttempts schedules a retry without touching the endpoint', async () => {
    http.setResponse({ status: 503, body: 'unavailable' });

    const result = await service.deliverWebhook(deliveryInput({ attempt: 1, maxAttempts: 3 }));

    expect(result).toEqual({ success: false, retry: true });

    const [, attempt] = logs.pushAttempt.mock.calls[0] as [string, any];
    expect(attempt).toMatchObject({ statusCode: 503, responseBody: 'unavailable', error: 'HTTP 503' });

    expect(logs.updateStatus).toHaveBeenCalledTimes(0);
    expect(endpoints.updateEndpoint).toHaveBeenCalledTimes(0);
    expect(redis.set).toHaveBeenCalledTimes(0); // still active
  });

  test('deliverWebhook: a 5xx at maxAttempts dead-letters and deactivates', async () => {
    http.setResponse({ status: 500, body: 'boom' });

    const result = await service.deliverWebhook(deliveryInput({ attempt: 3, maxAttempts: 3 }));

    expect(result).toEqual({ success: false, deadLetter: true });

    expect(logs.updateStatus).toHaveBeenCalledWith(deliveryLogId, { status: 'dead_letter' });
    // Retries are exhausted: deactivate and stop scheduling deliveries.
    expect(endpoints.updateEndpoint).toHaveBeenCalledTimes(1);
    expect(endpoints.updateEndpoint).toHaveBeenCalledWith(endpointId, { active: false });
    expect(redis.set).toHaveBeenCalledWith(`webhook:endpoint:${endpointId}:active`, '0', 'EX', 3600);
  });

  test('deliverWebhook: a network error is recorded and retried below maxAttempts', async () => {
    http.setError(new Error('connect ECONNREFUSED 8.8.8.8:443'));

    const result = await service.deliverWebhook(deliveryInput({ attempt: 1, maxAttempts: 3 }));

    expect(result).toEqual({ success: false, retry: true });

    const [, attempt] = logs.pushAttempt.mock.calls[0] as [string, any];
    expect(attempt.responseBody).toBe('');
    expect(attempt.error).toBe('connect ECONNREFUSED 8.8.8.8:443');
    expect(attempt.statusCode).toBeUndefined();
    expect(endpoints.updateEndpoint).toHaveBeenCalledTimes(0);
  });

  test('deliverWebhook: a timeout is recorded as such', async () => {
    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'AbortError';
    http.setError(timeout);

    const result = await service.deliverWebhook(deliveryInput({ attempt: 1, maxAttempts: 3 }));

    expect(result).toEqual({ success: false, retry: true });
    const [, attempt] = logs.pushAttempt.mock.calls[0] as [string, any];
    expect(attempt).toMatchObject({ responseBody: '', error: 'Request timeout (10s)' });
  });

  test('deliverWebhook: a network error at maxAttempts dead-letters and deactivates', async () => {
    http.setError(new Error('socket hang up'));

    const result = await service.deliverWebhook(deliveryInput({ attempt: 3, maxAttempts: 3 }));

    expect(result).toEqual({ success: false, deadLetter: true });
    expect(logs.updateStatus).toHaveBeenCalledWith(deliveryLogId, { status: 'dead_letter' });
    expect(endpoints.updateEndpoint).toHaveBeenCalledTimes(1);
    expect(endpoints.updateEndpoint).toHaveBeenCalledWith(endpointId, { active: false });
    expect(redis.set).toHaveBeenCalledWith(`webhook:endpoint:${endpointId}:active`, '0', 'EX', 3600);
  });

  test('deliverWebhook: keeps the endpoint active while retries remain', async () => {
    // The endpoint is deactivated only when the retry schedule is exhausted,
    // not after a fixed number of consecutive failures.
    const retryingEndpointId = await seedEndpoint({ consecutiveFailures: 4 });
    http.setResponse({ status: 500, body: 'boom' });

    const result = await service.deliverWebhook(deliveryInput({ endpointId: retryingEndpointId }));

    expect(result).toEqual({ success: false, retry: true });
    expect(endpoints.updateEndpoint).toHaveBeenCalledTimes(0);
    expect(redis.set).toHaveBeenCalledTimes(0);
  });

  test('deliverWebhook: an undecryptable secret is recorded as an error and retried', async () => {
    // Corrupt one byte inside the GCM auth tag: decryption must fail before any
    // request is made. The exact error message is runtime-specific, so only its
    // presence is asserted.
    const tampered = Buffer.from(encryptedSecret, 'base64');
    tampered[20] ^= 0xff;
    http.setResponse({ status: 200 });

    const result = await service.deliverWebhook(deliveryInput({ secret: tampered.toString('base64') }));

    expect(result).toEqual({ success: false, retry: true });
    expect(http.calls).toHaveLength(0);

    const [, attempt] = logs.pushAttempt.mock.calls[0] as [string, any];
    expect(attempt.statusCode).toBeUndefined();
    expect(attempt.responseBody).toBe('');
    expect((attempt.error ?? '').length).toBeGreaterThan(0);
  });
});
