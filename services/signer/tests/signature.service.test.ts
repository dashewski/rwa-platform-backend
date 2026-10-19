/**
 * Unit tests for SignatureService (signer).
 *
 * The service signs the manager-provided hash with its own wallet and queues
 * the response in the outbox — one write, no direct broker call. The outbox
 * publisher is a fake, so the assertion is about the exact message that is
 * queued (and its messageId, which the inbox uses for dedup).
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { ethers, Wallet } from 'ethers';
import { SignatureService } from '../src/services/signature.service';
import type { OutboxPublisherService } from '@shared/outbox-publisher';
import { AppError } from '@shared/errors/app-errors';

const PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

function createFakeOutbox() {
  const state = {
    calls: [] as Array<{ exchange: string; routingKey: string; payload: unknown; messageId: string }>,
    failWith: null as unknown,
  };

  const outbox = {
    state,

    publish: mock(
      async (exchange: string, routingKey: string, payload: unknown, messageId: string): Promise<void> => {
        if (state.failWith) throw state.failWith;
        state.calls.push({ exchange, routingKey, payload, messageId });
      },
    ),
  };

  return outbox;
}

describe('SignatureService (unit, fake outbox)', () => {
  let outbox: ReturnType<typeof createFakeOutbox>;
  let service: SignatureService;
  let address: string;

  const nowSeconds = (): number => Math.floor(Date.now() / 1000);

  beforeEach(() => {
    outbox = createFakeOutbox();
    service = new SignatureService(outbox as unknown as OutboxPublisherService, PRIVATE_KEY);
    address = new Wallet(PRIVATE_KEY).address;
  });

  test('exposes the address of its wallet', () => {
    expect(service.getSignerAddress()).toBe(address);
  });

  test('signs the received hash and queues the response with a deterministic messageId', async () => {
    const hash = ethers.keccak256(ethers.toUtf8Bytes('payload'));

    const result = await service.signHash({ hash, taskId: 'task-1', expired: nowSeconds() + 600 });

    expect(result.signer).toBe(address);
    expect(ethers.verifyMessage(ethers.getBytes(hash), result.signature)).toBe(address);

    expect(outbox.state.calls).toEqual([
      {
        exchange: 'sign.exchange',
        routingKey: 'response',
        payload: { taskId: 'task-1', signer: address, hash, signature: result.signature },
        messageId: `task-1:${address}`,
      },
    ]);
  });

  test('the signature is recoverable against the same hash only', async () => {
    const hash = ethers.keccak256(ethers.toUtf8Bytes('payload'));
    const other = ethers.keccak256(ethers.toUtf8Bytes('other'));

    const { signature } = await service.signHash({ hash, taskId: 'task-1', expired: nowSeconds() + 600 });

    expect(ethers.verifyMessage(ethers.getBytes(other), signature)).not.toBe(address);
  });

  test('an expired task is rejected before any signing and nothing is queued', async () => {
    const hash = ethers.keccak256(ethers.toUtf8Bytes('payload'));

    await expect(service.signHash({ hash, taskId: 'task-1', expired: nowSeconds() - 1 })).rejects.toThrow(
      'Task expired',
    );

    expect(outbox.state.calls).toEqual([]);
    await expect(service.signHash({ hash, taskId: 'task-1', expired: nowSeconds() - 1 })).rejects.toBeInstanceOf(
      AppError,
    );
  });

  test('a task that expires exactly now is still signed (boundary: expired < now)', async () => {
    const hash = ethers.keccak256(ethers.toUtf8Bytes('payload'));
    const expired = nowSeconds();

    await service.signHash({ hash, taskId: 'task-1', expired });

    expect(outbox.state.calls).toHaveLength(1);
  });

  test('two tasks produce two different messageIds', async () => {
    const hash = ethers.keccak256(ethers.toUtf8Bytes('payload'));
    const expired = nowSeconds() + 600;

    await service.signHash({ hash, taskId: 'task-1', expired });
    await service.signHash({ hash, taskId: 'task-2', expired });

    expect(outbox.state.calls.map((call) => call.messageId)).toEqual([`task-1:${address}`, `task-2:${address}`]);
  });

  test('a failing outbox publish propagates (the delivery will be retried)', async () => {
    outbox.state.failWith = new Error('MongoServerSelectionError: server selection timed out');
    const hash = ethers.keccak256(ethers.toUtf8Bytes('payload'));

    await expect(service.signHash({ hash, taskId: 'task-1', expired: nowSeconds() + 600 })).rejects.toThrow(
      'server selection timed out',
    );
  });
});
