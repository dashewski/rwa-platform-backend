/**
 * Unit tests for the signers-manager module resolvers.
 *
 * getSignatureTask is a plain resolver function invoked with a fake
 * GraphQLContext built from tests/fakes/* (fake eden treaty client + fake
 * inner services): no network, no database, no broker.
 */
import { describe, expect, test } from 'bun:test';
import type { GraphQLResolveInfo } from 'graphql';
import { AppError } from '@shared/errors/app-errors';
import type { GraphQLContext } from '../../src/graphql/context/types';
import { createFakeContext, fakeUser } from '../fakes/context.fake';
import { edenError, edenOk } from '../fakes/clients.fake';
import { getSignatureTask } from '../../src/graphql/modules/signers-manager/resolvers/queries/getSignatureTask';

const INFO = {} as GraphQLResolveInfo;
const SIGNATURE_TASK = {
  id: 'task-1',
  ownerId: 'owner-1',
  ownerType: 'company',
  hash: '0xtask-hash',
  requiredSignatures: 2,
  expired: 1700000000,
  completed: false,
  signatures: [{ signer: '0xsigner', signature: '0xsignature' }],
};

describe('signers-manager resolvers (unit, fake clients/services)', () => {
  describe('Query.getSignatureTask', () => {
    test('forwards the taskId, checks ownership on the fetched task and returns it', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.signersManagerClient.getSignatureTask.post.mockImplementation(async () => edenOk(SIGNATURE_TASK));

      const result = await getSignatureTask!(
        null as never,
        { input: { taskId: 'task-1' } } as never,
        fake as unknown as GraphQLContext,
      INFO);

      expect(fake.clients.signersManagerClient.getSignatureTask.post).toHaveBeenCalledWith({ taskId: 'task-1' });
      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
        userId: fakeUser.id,
        ownerId: 'owner-1', // derived from the fetched task
        ownerType: 'company', // derived from the fetched task
        permission: 'deploy',
      });
      expect(result).toEqual(SIGNATURE_TASK);
    });

    test('rejects an anonymous caller with 401 UNAUTHORIZED and calls nothing', async () => {
      const fake = createFakeContext();

      await expect(
        getSignatureTask!(null as never, { input: { taskId: 'task-1' } } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

      expect(fake.clients.signersManagerClient.getSignatureTask.post).toHaveBeenCalledTimes(0);
      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledTimes(0);
    });

    test('maps an upstream failure to 502 BAD_GATEWAY and never checks ownership', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.signersManagerClient.getSignatureTask.post.mockImplementation(async () =>
        edenError(404, 'NOT_FOUND', 'no task'),
      );

      await expect(
        getSignatureTask!(null as never, { input: { taskId: 'missing' } } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });

      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledTimes(0);
    });

    test('propagates an ownership rejection and returns no task', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.signersManagerClient.getSignatureTask.post.mockImplementation(async () => edenOk(SIGNATURE_TASK));
      fake.services.ownership.checkOwnership.mockImplementation(async () => {
        throw new AppError({ message: 'User does not have permission', statusCode: 403, code: 'FORBIDDEN' });
      });

      await expect(
        getSignatureTask!(null as never, { input: { taskId: 'task-1' } } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

      // The task was fetched before the ownership check ran.
      expect(fake.clients.signersManagerClient.getSignatureTask.post).toHaveBeenCalledTimes(1);
    });
  });
});
