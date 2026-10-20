/**
 * Component tests for the signers-manager HTTP layer.
 *
 * The Elysia app is assembled in-process the way src/app.ts does it, minus the
 * infrastructure-bound pieces: a fake Repositories plugin exposes the same
 * decorators the real one does, the Clients plugin carries a fake RabbitMQ
 * client, while the services and controllers plugins are the real ones.
 * Requests go through app.handle() — no port is bound, no Mongo is queried, no
 * message is published. The daemons plugin is deliberately not mounted.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { Elysia } from 'elysia';
import mongoose from 'mongoose';
import { ethers } from 'ethers';
import { AppError } from '@shared/errors/app-errors';
import { ErrorHandlerPlugin } from '@shared/errors/error-handler.plugin';
import { createServicesPlugin } from '../src/plugins/services.plugin';
import { createControllersPlugin } from '../src/plugins/controllers.plugin';
import type { RepositoriesPlugin } from '../src/plugins/repositories.plugin';
import type { ClientsPlugin } from '../src/plugins/clients.plugin';
import type { SignaturesService } from '../src/services/signatures.service';
import { createFakeSignatureRepository, type FakeSignatureRepository } from './fakes/signature.repository.fake';
import {
  createFakeSignatureTaskRepository,
  type FakeSignatureTaskRepository,
} from './fakes/signatureTask.repository.fake';

const INNER_HASH = `0x${'11'.repeat(32)}`; // bytes32 hex, the shape ethers.solidityPackedKeccak256 requires
const EXPIRED_FUTURE = 2_000_000_000; // 2033-05-18, far after any test run
const EXPIRED_LATER = 2_100_000_000;

const SIGNER_1 = '0x1111111111111111111111111111111111111111';
const SIGNATURE_1 = `0x${'ab'.repeat(65)}`;

const TASK = {
  ownerId: 'owner-1',
  ownerType: 'business',
  hash: INNER_HASH,
  requiredSignatures: 2,
  expired: EXPIRED_FUTURE,
};

function finalHash(innerHash: string, expired: number): string {
  return ethers.keccak256(ethers.concat([innerHash, ethers.zeroPadValue(ethers.toBeHex(expired), 32)]));
}

function buildApp(signatures: FakeSignatureRepository, tasks: FakeSignatureTaskRepository) {
  const outboxRows: unknown[] = [];

  // Same decorator names the src plugins read.
  const repositoriesPlugin = new Elysia({ name: 'Repositories' })
    .decorate('signatureRepository', signatures)
    .decorate('signatureTaskRepository', tasks)
    .decorate('inboxConsumerMessageRepository', { create: mock(async () => true) })
    .decorate('outboxPublisherMessageRepository', {
      create: mock(async (data: unknown) => {
        outboxRows.push(data);
        return data;
      }),
    });

  const clientsPlugin = new Elysia({ name: 'Clients' }).decorate('rabbitMQClient', {
    isExchangeRegistered: mock(() => true),
    publish: mock(async () => undefined),
  });

  const servicesPlugin = createServicesPlugin(
    repositoriesPlugin as unknown as RepositoriesPlugin,
    clientsPlugin as unknown as ClientsPlugin,
  );

  const app = new Elysia().onError(ErrorHandlerPlugin).use(createControllersPlugin(servicesPlugin));

  return {
    app,
    outboxRows,
    signaturesService: servicesPlugin.decorator.signaturesService as unknown as SignaturesService,
  };
}

type App = ReturnType<typeof buildApp>['app'];

async function post(app: App, path: string, body: unknown) {
  const response = await app.handle(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

  return { status: response.status, body: (await response.json()) as any };
}

describe('signers-manager HTTP layer (component, fake repositories and outbox)', () => {
  let signatures: FakeSignatureRepository;
  let tasks: FakeSignatureTaskRepository;
  let app: App;
  let outboxRows: unknown[];
  let signaturesService: SignaturesService;
  let originalTransaction: unknown;

  beforeEach(() => {
    // createTask writes the task and its outbox record in one transaction.
    originalTransaction = (mongoose.connection as unknown as { transaction: unknown }).transaction;
    (mongoose.connection as unknown as { transaction: unknown }).transaction = async <T>(fn: () => Promise<T>) =>
      await fn();

    signatures = createFakeSignatureRepository();
    tasks = createFakeSignatureTaskRepository();
    ({ app, outboxRows, signaturesService } = buildApp(signatures, tasks));
  });

  afterEach(() => {
    (mongoose.connection as unknown as { transaction: unknown }).transaction = originalTransaction;
  });

  test('createSignatureTask → getSignatureTask round-trip over the derived final hash', async () => {
    const created = await post(app, '/createSignatureTask', TASK);

    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({
      ownerId: TASK.ownerId,
      ownerType: TASK.ownerType,
      requiredSignatures: TASK.requiredSignatures,
      expired: TASK.expired,
      completed: false,
    });
    expect(created.body.hash).toBe(finalHash(INNER_HASH, EXPIRED_FUTURE));
    expect(typeof created.body.id).toBe('string');
    expect(created.body.id).toHaveLength(24);
    expect(created.body).not.toHaveProperty('_id');

    expect(outboxRows).toEqual([
      {
        exchange: 'sign.exchange',
        routingKey: 'task',
        payload: { hash: finalHash(INNER_HASH, EXPIRED_FUTURE), taskId: created.body.id, expired: EXPIRED_FUTURE },
        messageId: created.body.id,
      },
    ]);

    const fetched = await post(app, '/getSignatureTask', { taskId: created.body.id });
    expect(fetched.status).toBe(200);

    const { signatures, ...fetchedTask } = fetched.body;
    expect(fetchedTask).toEqual(created.body);
    expect(signatures).toEqual([]); // an open task carries no signatures yet
  });

  test('createSignatureTask: an invalid payload never reaches the service', async () => {
    const response = await post(app, '/createSignatureTask', { ownerId: 'owner-1' });

    expect(response.status).not.toBe(200);
    expect(tasks.create).toHaveBeenCalledTimes(0);
    expect(outboxRows).toEqual([]);
  });

  test('getSignatureTask: an unknown id maps to 404 NOT_FOUND', async () => {
    const response = await post(app, '/getSignatureTask', { taskId: 'unknown-id' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'SignatureTask unknown-id not found' } });
  });

  test('createSignatureTask: a repository conflict maps to 409 and nothing is queued', async () => {
    tasks.create.mockRejectedValueOnce(
      new AppError({ message: 'Duplicate signature task', statusCode: 409, code: 'CONFLICT' }),
    );

    const response = await post(app, '/createSignatureTask', TASK);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: { code: 'CONFLICT', message: 'Duplicate signature task' } });
    expect(outboxRows).toEqual([]);
  });

  test('getSignatureTask: a completed task exposes its signatures without ids', async () => {
    const created = await post(app, '/createSignatureTask', { ...TASK, requiredSignatures: 1 });
    // Simulate what the responses inbox does once a signer replies.
    await signaturesService.addSignature(
      { taskId: created.body.id, signer: SIGNER_1, signature: SIGNATURE_1 },
      async () => undefined,
    );

    const fetched = await post(app, '/getSignatureTask', { taskId: created.body.id });

    expect(fetched.status).toBe(200);
    expect(fetched.body.completed).toBe(true);
    expect(fetched.body.signatures).toEqual([{ signer: SIGNER_1, signature: SIGNATURE_1 }]);
  });

  test('createSignatureTask: the same inner hash with a fresh expiry is a separate task', async () => {
    const first = await post(app, '/createSignatureTask', TASK);
    const second = await post(app, '/createSignatureTask', { ...TASK, expired: EXPIRED_LATER });

    expect(second.status).toBe(200);
    expect(second.body.id).not.toBe(first.body.id);
    expect(second.body.hash).not.toBe(first.body.hash);
    expect(second.body.hash).toBe(finalHash(INNER_HASH, EXPIRED_LATER));
  });
});
