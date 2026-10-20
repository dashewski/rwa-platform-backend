/**
 * Unit tests for SignaturesService.
 *
 * Scope: the service layer only. Repositories and the outbox publisher are
 * replaced with in-memory fakes (tests/fakes/*.fake.ts), so these tests need
 * no database, no broker and no network. Run with `bun test` from
 * services/signers-manager.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import mongoose from 'mongoose';
import { ethers } from 'ethers';
import { AppError } from '@shared/errors/app-errors';
import { SignaturesService } from '../src/services/signatures.service';
import type { SignatureRepository } from '../src/repositories/signature.repository';
import type { SignatureTaskRepository } from '../src/repositories/signatureTask.repository';
import type { OutboxPublisherService } from '@shared/outbox-publisher';
import { createFakeSignatureRepository, type FakeSignatureRepository } from './fakes/signature.repository.fake';
import {
  createFakeSignatureTaskRepository,
  type FakeSignatureTaskRepository,
} from './fakes/signatureTask.repository.fake';
import { createFakeOutbox, type FakeOutbox } from './fakes/outbox.fake';

const INNER_HASH = `0x${'11'.repeat(32)}`; // bytes32 hex, the shape ethers.solidityPackedKeccak256 requires
const EXPIRED_FUTURE = 2_000_000_000; // 2033-05-18, far after any test run
const EXPIRED_LATER = 2_100_000_000;
const EXPIRED_PAST = 1_600_000_000; // 2020-09-13, far before any test run

const SIGNER_1 = '0x1111111111111111111111111111111111111111';
const SIGNER_2 = '0x2222222222222222222222222222222222222222';
const SIGNATURE_1 = `0x${'ab'.repeat(65)}`;
const SIGNATURE_2 = `0x${'cd'.repeat(65)}`;

const TASK = {
  ownerId: 'owner-1',
  ownerType: 'business',
  hash: INNER_HASH,
  requiredSignatures: 2,
  expired: EXPIRED_FUTURE,
};

/**
 * Independent derivation of the manager-side final hash:
 * keccak256(abi-packed bytes32 innerHash ++ uint256 expired), recomputed here
 * as raw keccak256 over the manually zero-padded concatenation, so the
 * assertion does not simply re-run the helper under test.
 */
function finalHash(innerHash: string, expired: number): string {
  return ethers.keccak256(ethers.concat([innerHash, ethers.zeroPadValue(ethers.toBeHex(expired), 32)]));
}

describe('SignaturesService (unit, fake repositories and outbox)', () => {
  let signatures: FakeSignatureRepository;
  let tasks: FakeSignatureTaskRepository;
  let outbox: FakeOutbox;
  let service: SignaturesService;
  let commitInbox: ReturnType<typeof mock<() => Promise<void>>>;
  let addSignature: (data: any) => ReturnType<SignaturesService['addSignature']>;

  let originalTransaction: unknown;

  beforeEach(() => {
    // createTask runs its insert and the outbox write in one mongoose
    // transaction; there is no database here, so the callback is run inline.
    originalTransaction = (mongoose.connection as unknown as { transaction: unknown }).transaction;
    (mongoose.connection as unknown as { transaction: unknown }).transaction = async <T>(
      fn: () => Promise<T>,
    ): Promise<T> => await fn();

    signatures = createFakeSignatureRepository();
    tasks = createFakeSignatureTaskRepository();
    outbox = createFakeOutbox();
    service = new SignaturesService(
      signatures as unknown as SignatureRepository,
      tasks as unknown as SignatureTaskRepository,
      outbox as unknown as OutboxPublisherService,
    );
    // The service writes and commits the inbox marker in one transaction.
    (mongoose.connection as unknown as { transaction: unknown }).transaction = async <T>(
      fn: () => Promise<T>,
    ): Promise<T> => fn();

    commitInbox = mock(async (): Promise<void> => undefined);
    addSignature = (data: any) => service.addSignature(data, commitInbox);
  });

  afterEach(() => {
    (mongoose.connection as unknown as { transaction: unknown }).transaction = originalTransaction;
  });

  test('createTask: persists the derived final hash, notifies signers and returns a mapped task', async () => {
    const expectedHash = finalHash(INNER_HASH, EXPIRED_FUTURE);

    const task = await service.createTask(TASK);

    expect(tasks.create).toHaveBeenCalledTimes(1);
    expect(tasks.create).toHaveBeenCalledWith({ ...TASK, hash: expectedHash });
    expect(outbox.publish).toHaveBeenCalledTimes(1);
    expect(outbox.publish).toHaveBeenCalledWith(
      'sign.exchange',
      'task',
      { hash: expectedHash, taskId: task.id, expired: EXPIRED_FUTURE },
      task.id,
    );

    expect(task).toMatchObject({ ...TASK, hash: expectedHash, completed: false });
    expect(task.hash).toBe(expectedHash);
    expect(task.hash).not.toBe(INNER_HASH); // the inner hash never leaves the manager
    expect(typeof task.id).toBe('string');
    expect(task.id).toHaveLength(24); // Mongo ObjectId hex
    expect(task).not.toHaveProperty('_id');
    // The result must be plain JSON — no ObjectId or class instances leaking to the caller.
    expect(JSON.parse(JSON.stringify(task))).toEqual(task);
    // The persisted document carries the final hash too.
    expect(tasks.store.get(task.id)?.hash).toBe(expectedHash);
  });

  test('createTask: the same inner hash with a fresh expiry becomes a separate task', async () => {
    const first = await service.createTask({ ...TASK, requiredSignatures: 1 });
    const second = await service.createTask({ ...TASK, requiredSignatures: 1, expired: EXPIRED_LATER });

    expect(tasks.create).toHaveBeenCalledTimes(2);
    expect(first.hash).toBe(finalHash(INNER_HASH, EXPIRED_FUTURE));
    expect(second.hash).toBe(finalHash(INNER_HASH, EXPIRED_LATER));
    expect(second.hash).not.toBe(first.hash);
    expect(second.id).not.toBe(first.id);
  });

  test('createTask: a repository rejection propagates and signers are not notified', async () => {
    // The real model has a unique index on `hash`, so an identical repeat inside
    // one expiry window fails at insert time (Mongo E11000). The service performs
    // no duplicate pre-check: it forwards whatever the repository throws and must
    // not tell signers about a task that was never stored.
    const conflict = new AppError({
      message: `Duplicate signature task for hash ${finalHash(INNER_HASH, EXPIRED_FUTURE)}`,
      statusCode: 409,
      code: 'CONFLICT',
    });
    tasks.create.mockRejectedValueOnce(conflict);

    await expect(service.createTask(TASK)).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
    expect(tasks.create).toHaveBeenCalledTimes(1);
    expect(outbox.publish).toHaveBeenCalledTimes(0);
  });

  test('addSignature: propagates NOT_FOUND for an unknown taskId and stores nothing', async () => {
    await expect(
      addSignature({ taskId: 'unknown-id', signer: SIGNER_1, signature: SIGNATURE_1 }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });

    expect(signatures.create).toHaveBeenCalledTimes(0);
  });

  test('addSignature: rejects a signature for an expired task', async () => {
    // createTask itself never validates that `expired` lies in the future — a
    // retry may race with the deadline and the contract decides for real.
    const task = await service.createTask({ ...TASK, expired: EXPIRED_PAST });

    await expect(
      addSignature({ taskId: task.id, signer: SIGNER_1, signature: SIGNATURE_1 }),
    ).rejects.toMatchObject({ statusCode: 410, code: 'EXPIRED' });

    expect(signatures.create).toHaveBeenCalledTimes(0);
  });

  test('addSignature: expired = 0 is treated as never-expiring (falsy guard)', async () => {
    // The guard reads `if (task.expired && task.expired < now)` — a task stored
    // with expired: 0 skips the expiry check entirely instead of being rejected.
    const task = await service.createTask({ ...TASK, expired: 0 });

    await addSignature({ taskId: task.id, signer: SIGNER_1, signature: SIGNATURE_1 });

    expect(signatures.create).toHaveBeenCalledTimes(1);
  });

  test('addSignature: stores the signature without touching the task document', async () => {
    const task = await service.createTask(TASK); // requires 2 signatures

    await addSignature({ taskId: task.id, signer: SIGNER_1, signature: SIGNATURE_1 });

    expect(signatures.create).toHaveBeenCalledTimes(1);
    expect(signatures.create).toHaveBeenCalledWith({
      taskId: task.id,
      signer: SIGNER_1,
      signature: SIGNATURE_1,
    });

    expect(tasks.store.get(task.id)).not.toHaveProperty('completed');
  });

  test('getSignatureTask: reports the task as completed once the threshold is reached', async () => {
    const task = await service.createTask(TASK); // requires 2 signatures
    await addSignature({ taskId: task.id, signer: SIGNER_1, signature: SIGNATURE_1 });
    await addSignature({ taskId: task.id, signer: SIGNER_2, signature: SIGNATURE_2 });

    const result = await service.getSignatureTask(task.id);

    expect(result.completed).toBe(true);
    expect(result.signatures).toHaveLength(2);
  });

  test('getSignatureTask: an open task carries no signatures yet', async () => {
    const task = await service.createTask(TASK);

    const result = await service.getSignatureTask(task.id);

    expect(result).toMatchObject({
      id: task.id,
      hash: finalHash(INNER_HASH, EXPIRED_FUTURE),
      requiredSignatures: 2,
      expired: EXPIRED_FUTURE,
      completed: false,
    });
    expect(result.signatures).toEqual([]);
    expect(signatures.findByTaskId).toHaveBeenCalledTimes(1);
    expect(result).not.toHaveProperty('_id');
  });

  test('getSignatureTask: returns the mapped signatures once the task is completed', async () => {
    const task = await service.createTask({ ...TASK, requiredSignatures: 1 });
    await addSignature({ taskId: task.id, signer: SIGNER_1, signature: SIGNATURE_1 });

    const result = await service.getSignatureTask(task.id);

    expect(result.completed).toBe(true);
    expect(signatures.findByTaskId).toHaveBeenCalledWith(task.id);
    // Signature documents are projected down to signer + signature: no ids leak.
    expect(result.signatures).toEqual([{ signer: SIGNER_1, signature: SIGNATURE_1 }]);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  test('getSignatureTask: propagates NOT_FOUND for an unknown id', async () => {
    await expect(service.getSignatureTask('unknown-id')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });
});
