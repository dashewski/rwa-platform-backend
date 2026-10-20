/**
 * Scenario: signers-manager ↔ signer-1..3 over `sign.exchange`.
 *
 * Full round-trip of the signing protocol:
 *   manager.createTask → outbox key `task` → direct exchange copies the task
 *   into every signer queue (the fan-out the 3-of-3 quorum depends on) → each
 *   signer signs and queues a `response` → manager inbox deduplicates by
 *   `${taskId}:${signer}` and counts signatures until the task is completed.
 *
 * Real: SignaturesService, signature repositories, SignatureService (real
 * ethers wallets), both inbox daemons, both outbox services, broker, Mongo.
 *
 * Run:
 *   bun --env-file=infrastructure/docker/.env test --timeout=180000 \
 *     tests/rabbitmq/scenarios/signing.scenario.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { connect } from 'amqplib';
import type { ChannelModel, ConfirmChannel } from 'amqplib';
import { Wallet, id as keccakId } from 'ethers';
import mongoose from 'mongoose';
import {
  RABBIT_URI,
  ScopedClient,
  connectMongo,
  createInboxService,
  deleteScopedTopology,
  inboxModel,
  dropMongo,
  scenarioPrefix,
  waitFor,
} from './harness';
import { OutboxPublisherService } from '@shared/outbox-publisher/src/services/outboxPublisher.service';
import { OutboxPublisherMessageRepository } from '@shared/outbox-publisher/src/repositories/outboxPublisherMessage.repository';
import { OutboxPublisherMessageEntity } from '@shared/outbox-publisher/src/models/entity/outboxPublisherMessage.entity';
import { SignaturesService } from '../../../services/signers-manager/src/services/signatures.service';
import { SignatureRepository } from '../../../services/signers-manager/src/repositories/signature.repository';
import { SignatureTaskRepository } from '../../../services/signers-manager/src/repositories/signatureTask.repository';
import { SignatureEntity } from '../../../services/signers-manager/src/models/entity/signature.entity';
import { SignatureTask } from '../../../services/signers-manager/src/models/entity/signatureTask.entity';
import { RabbitMQClient as SignersManagerClient } from '../../../services/signers-manager/src/clients/rabbitmq.client';
import { InboxConsumerDaemon as SignersManagerInbox } from '../../../services/signers-manager/src/daemons/inboxConsumer.daemon';
import { SignatureService } from '../../../services/signer/src/services/signature.service';
import { RabbitMQClient as SignerClient } from '../../../services/signer/src/clients/rabbitmq.client';
import { InboxConsumerDaemon as SignerInbox } from '../../../services/signer/src/daemons/inboxConsumer.daemon';

const PREFIX = scenarioPrefix('signing');
const EXCHANGE = 'sign.exchange';
const SIGNER_NAMES = ['signer-1', 'signer-2', 'signer-3'] as const;

describe('scenario: signers-manager ↔ signers', () => {
  const prefix = PREFIX;
  const managerTopology = new SignersManagerClient('amqp://placeholder').getTopologyDefinition();
  const signerTopologies = SIGNER_NAMES.map(
    (name) => new SignerClient('amqp://placeholder', name).getTopologyDefinition(),
  );

  const managerClient = new ScopedClient('signers-manager', prefix, managerTopology);
  const signerClients = SIGNER_NAMES.map(
    (name, index) => new ScopedClient(name, prefix, signerTopologies[index]),
  );

  const wallets = SIGNER_NAMES.map(() => Wallet.createRandom());

  let raw: { connection: ChannelModel; channel: ConfirmChannel };
  let signatures: SignaturesService;
  let managerOutbox: OutboxPublisherService;
  let signerServices: SignatureService[] = [];
  const daemons: Array<{ initialize(): Promise<void>; stop(): Promise<void> }> = [];

  let taskId = '';
  let innerHash = '';

  beforeAll(async () => {
    await connectMongo('rwa_scn_signing');
    // createIndexes, not init(): the scenarios reconnect to their own databases and
    // mongoose caches init() results across files, which would skip the unique indexes
    await OutboxPublisherMessageEntity.createIndexes();
    await SignatureEntity.createIndexes();
    await SignatureTask.createIndexes();

    const connection = await connect(RABBIT_URI, { heartbeat: 5 });
    connection.on('error', () => undefined);
    const channel = await connection.createConfirmChannel();
    channel.on('error', () => undefined);
    raw = { connection, channel };

    await managerClient.initialize();
    for (const client of signerClients) await client.initialize();

    managerOutbox = new OutboxPublisherService(managerClient, new OutboxPublisherMessageRepository());
    signatures = new SignaturesService(new SignatureRepository(), new SignatureTaskRepository(), managerOutbox);

    signerServices = signerClients.map(
      (client, index) =>
        new SignatureService(
          new OutboxPublisherService(client, new OutboxPublisherMessageRepository()),
          wallets[index].privateKey,
        ),
    );

    // every signer and the manager keep their own marker store: the same taskId
    // arrives on three signer queues and must be applied once per signer
    daemons.push(new SignersManagerInbox(managerClient as never, createInboxService('signers-manager'), signatures as never));
    signerClients.forEach((client, index) => {
      daemons.push(
        new SignerInbox(client as never, createInboxService(`signer-${index + 1}`), signerServices[index] as never),
      );
    });

    for (const consumer of ['signers-manager', 'signer-1', 'signer-2', 'signer-3']) {
      await inboxModel(consumer).createIndexes();
    }

    for (const daemon of daemons) await daemon.initialize();
  });

  afterAll(async () => {
    for (const daemon of daemons) await daemon.stop();

    await deleteScopedTopology(prefix, managerTopology, raw.channel);
    for (const topology of signerTopologies) {
      await deleteScopedTopology(prefix, topology, raw.channel);
    }

    await raw.connection.close().catch(() => undefined);
    await managerClient.disconnect();
    for (const client of signerClients) await client.disconnect();
    await dropMongo();
  });

  test('a 3-of-3 task reaches every signer queue and each signer answers with one response', async () => {
    innerHash = keccakId('approval-for-pool-1');
    const expired = Math.floor(Date.now() / 1000) + 3_600;

    const task = await signatures.createTask({
      ownerId: new mongoose.Types.ObjectId().toString(),
      ownerType: 'pool',
      hash: innerHash,
      requiredSignatures: 3,
      expired,
    });
    taskId = task.id;

    const taskRow = await OutboxPublisherMessageEntity.findOne({ exchange: EXCHANGE, messageId: taskId }).lean();
    expect(taskRow).toMatchObject({ routingKey: 'task', status: 'pending' });

    await managerOutbox.processOutbox(EXCHANGE, false, 5, 5);

    // three copies of one task → three responses, one per signer wallet
    await waitFor(
      async () =>
        (await OutboxPublisherMessageEntity.countDocuments({ exchange: EXCHANGE, routingKey: 'response' })) === 3,
      60_000,
    );

    const responses = await OutboxPublisherMessageEntity.find({ exchange: EXCHANGE, routingKey: 'response' }).lean();
    const signers = responses.map((row) => row.messageId.split(':')[1]).sort();

    expect(signers).toEqual(wallets.map((wallet) => wallet.address).sort());

    // the signer queues of the sandbox are drained: every signer consumed its copy
    for (const name of SIGNER_NAMES) {
      expect((await raw.channel.checkQueue(managerClient.queueName(`sign.requests.${name}`))).messageCount).toBe(0);
    }
  }, 90_000);

  test('the manager collects the responses and completes the task exactly once', async () => {
    await managerOutbox.processOutbox(EXCHANGE, false, 5, 5);

    await waitFor(async () => (await SignatureEntity.countDocuments({ taskId })) === 3, 60_000);

    const stored = await SignatureTask.findById(taskId).lean();
    expect(stored?.completed).toBe(true);

    const signaturesList = await new SignatureRepository().findByTaskId(taskId);
    expect(signaturesList).toHaveLength(3);
    expect(new Set(signaturesList.map((signature) => signature.signer)).size).toBe(3);

    // every applied response left an inbox marker: a redelivery cannot double-count
    for (const signature of signaturesList) {
      expect(await inboxModel('signers-manager').countDocuments({ messageId: `${taskId}:${signature.signer}` })).toBe(1);
    }
  }, 90_000);

  test('a redelivered response is a no-op: the inbox marker stops it before the service', async () => {
    const signer = wallets[0].address;
    const original = await OutboxPublisherMessageEntity.findOne({
      exchange: EXCHANGE,
      messageId: `${taskId}:${signer}`,
    }).lean();

    await signerClients[0].publish(EXCHANGE, 'response', original?.payload, { messageId: `${taskId}:${signer}` });

    await waitFor(
      async () => (await raw.channel.checkQueue(managerClient.queueName('sign.responses'))).messageCount === 0,
      30_000,
    );
    await Bun.sleep(200);

    expect(await SignatureEntity.countDocuments({ taskId })).toBe(3);
  }, 60_000);

  test('a response for an already completed task is rejected and parked, not applied', async () => {
    const outsider = Wallet.createRandom().address;

    // the broker would add x-death itself; publish the count of a finished third cycle
    await signerClients[1].publish(
      EXCHANGE,
      'response',
      { taskId, signer: outsider, hash: innerHash, signature: '0xdeadbeef' },
      {
        messageId: `${taskId}:${outsider}`,
        headers: { 'x-death': [{ queue: 'sign.responses.retry', reason: 'expired', count: 3 }] },
      } as never,
    );

    const parked = managerClient.queueName('sign.responses.parked');
    await waitFor(async () => (await raw.channel.checkQueue(parked)).messageCount === 1, 60_000);

    expect(await SignatureEntity.countDocuments({ taskId })).toBe(3);
    expect(await SignatureEntity.countDocuments({ taskId, signer: outsider })).toBe(0);
    expect(await inboxModel('signers-manager').countDocuments({ messageId: `${taskId}:${outsider}` })).toBe(0);
  }, 120_000);
});
