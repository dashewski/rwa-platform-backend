/**
 * Unit tests for the documents module resolvers (gateway).
 *
 * Resolvers are plain functions that read { clients, services, user } off the
 * GraphQL context, so they are called directly with the fakes from tests/fakes:
 * eden clients resolve in-memory { data, error } envelopes and the inner
 * services are bun:test mocks. No network, no database, no broker.
 */
import { describe, expect, test } from 'bun:test';
import { AppError } from '@shared/errors/app-errors';
import type { GraphQLContext } from '../../src/graphql/context/types';
import { edenError, edenOk } from '../fakes/clients.fake';
import { createFakeContext, fakeUser } from '../fakes/context.fake';
import { createFolder } from '../../src/graphql/modules/documents/resolvers/mutations/createFolder';
import { deleteDocument } from '../../src/graphql/modules/documents/resolvers/mutations/deleteDocument';
import { deleteFolder } from '../../src/graphql/modules/documents/resolvers/mutations/deleteFolder';
import { updateDocument } from '../../src/graphql/modules/documents/resolvers/mutations/updateDocument';
import { updateFolder } from '../../src/graphql/modules/documents/resolvers/mutations/updateFolder';
import { getDocument } from '../../src/graphql/modules/documents/resolvers/queries/getDocument';
import { getDocuments } from '../../src/graphql/modules/documents/resolvers/queries/getDocuments';
import { getFolder } from '../../src/graphql/modules/documents/resolvers/queries/getFolder';
import { getFolders } from '../../src/graphql/modules/documents/resolvers/queries/getFolders';

const DOCUMENT = {
  id: 'doc-1',
  folderId: 'folder-1',
  name: 'whitepaper.pdf',
  fileId: 'file-1',
  path: 'documents/whitepaper.pdf',
  url: 'https://files.local/whitepaper.pdf',
  mimeType: 'application/pdf',
  size: 2048,
  ownerId: 'owner-1',
  ownerType: 'company',
  creator: 'user-1',
  parentId: 'business-1',
  grandParentId: 'grand-1',
  createdAt: 1700000000000,
  updatedAt: 1700000001000,
};

const FOLDER = {
  id: 'folder-1',
  name: 'Contracts',
  parentId: 'business-1',
  ownerId: 'owner-1',
  ownerType: 'company',
  creator: 'user-1',
  grandParentId: 'grand-1',
  createdAt: 1700000000000,
  updatedAt: 1700000001000,
};

describe('gateway documents resolvers (unit, fake clients/services)', () => {
  describe('getDocument', () => {
    test('getDocument: forwards the id and maps the document', async () => {
      const fake = createFakeContext();
      fake.clients.documentsClient.getDocument.post.mockImplementation(async () =>
        edenOk({ ...DOCUMENT, internalField: 'must not leak' }),
      );

      const result = await getDocument(null as never, { id: 'doc-1' } as never, fake as unknown as GraphQLContext);

      expect(fake.clients.documentsClient.getDocument.post).toHaveBeenCalledTimes(1);
      expect(fake.clients.documentsClient.getDocument.post).toHaveBeenCalledWith({ id: 'doc-1' });
      expect(result).toEqual(DOCUMENT);
    });

    test('getDocument: maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext();
      fake.clients.documentsClient.getDocument.post.mockImplementation(async () =>
        edenError(404, 'NOT_FOUND', 'document not found'),
      );

      await expect(
        getDocument(null as never, { id: 'missing' } as never, fake as unknown as GraphQLContext),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to get document' });
    });
  });

  describe('getDocuments', () => {
    test('getDocuments: forwards filter, sort and pagination', async () => {
      const fake = createFakeContext();
      const input = {
        filter: { parentId: 'business-1', ownerId: 'owner-1' },
        sort: { createdAt: -1 },
        limit: 10,
        offset: 20,
      };
      fake.clients.documentsClient.getDocuments.post.mockImplementation(async () => edenOk([DOCUMENT]));

      const result = await getDocuments(null as never, { input } as never, fake as unknown as GraphQLContext);

      expect(fake.clients.documentsClient.getDocuments.post).toHaveBeenCalledTimes(1);
      expect(fake.clients.documentsClient.getDocuments.post).toHaveBeenCalledWith({
        filter: input.filter,
        sort: input.sort,
        limit: 10,
        offset: 20,
      });
      expect(result).toEqual([DOCUMENT]);
    });

    test('getDocuments: defaults filter and sort to empty objects', async () => {
      const fake = createFakeContext();
      fake.clients.documentsClient.getDocuments.post.mockImplementation(async () => edenOk([]));

      const result = await getDocuments(null as never, { input: {} } as never, fake as unknown as GraphQLContext);

      expect(fake.clients.documentsClient.getDocuments.post).toHaveBeenCalledWith({
        filter: {},
        sort: {},
        limit: undefined,
        offset: undefined,
      });
      expect(result).toEqual([]);
    });

    test('getDocuments: maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext();
      fake.clients.documentsClient.getDocuments.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(
        getDocuments(null as never, { input: { limit: 10 } } as never, fake as unknown as GraphQLContext),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to get documents' });
    });
  });

  describe('getFolder', () => {
    test('getFolder: forwards the id and maps the folder', async () => {
      const fake = createFakeContext();
      fake.clients.documentsClient.getFolder.post.mockImplementation(async () => edenOk(FOLDER));

      const result = await getFolder(null as never, { id: 'folder-1' } as never, fake as unknown as GraphQLContext);

      expect(fake.clients.documentsClient.getFolder.post).toHaveBeenCalledWith({ id: 'folder-1' });
      expect(result).toEqual(FOLDER);
    });

    test('getFolder: maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext();
      fake.clients.documentsClient.getFolder.post.mockImplementation(async () =>
        edenError(404, 'NOT_FOUND', 'folder not found'),
      );

      await expect(
        getFolder(null as never, { id: 'missing' } as never, fake as unknown as GraphQLContext),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to get folder' });
    });
  });

  describe('getFolders', () => {
    test('getFolders: forwards filter, sort and pagination', async () => {
      const fake = createFakeContext();
      const input = {
        filter: { parentId: 'business-1' },
        sort: { name: 1 },
        limit: 5,
        offset: 0,
      };
      fake.clients.documentsClient.getFolders.post.mockImplementation(async () => edenOk([FOLDER]));

      const result = await getFolders(null as never, { input } as never, fake as unknown as GraphQLContext);

      expect(fake.clients.documentsClient.getFolders.post).toHaveBeenCalledWith({
        filter: input.filter,
        sort: input.sort,
        limit: 5,
        offset: 0,
      });
      expect(result).toEqual([FOLDER]);
    });

    test('getFolders: defaults filter and sort to empty objects', async () => {
      const fake = createFakeContext();
      fake.clients.documentsClient.getFolders.post.mockImplementation(async () => edenOk([]));

      await getFolders(null as never, { input: {} } as never, fake as unknown as GraphQLContext);

      expect(fake.clients.documentsClient.getFolders.post).toHaveBeenCalledWith({
        filter: {},
        sort: {},
        limit: undefined,
        offset: undefined,
      });
    });

    test('getFolders: maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext();
      fake.clients.documentsClient.getFolders.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(
        getFolders(null as never, { input: {} } as never, fake as unknown as GraphQLContext),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to get folders' });
    });
  });

  describe('updateDocument', () => {
    test('updateDocument: loads the document, checks ownership and forwards the update', async () => {
      const fake = createFakeContext({ user: fakeUser });
      const input = { id: 'doc-1', updateData: { name: 'renamed.pdf' } };
      fake.clients.documentsClient.getDocument.post.mockImplementation(async () => edenOk(DOCUMENT));
      fake.clients.documentsClient.updateDocument.post.mockImplementation(async () =>
        edenOk({ ...DOCUMENT, name: 'renamed.pdf' }),
      );

      const result = await updateDocument(null as never, { input } as never, fake as unknown as GraphQLContext);

      expect(fake.clients.documentsClient.getDocument.post).toHaveBeenCalledWith({ id: 'doc-1' });
      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
        userId: fakeUser.id,
        ownerId: DOCUMENT.ownerId,
        ownerType: DOCUMENT.ownerType,
        permission: 'content',
      });
      expect(fake.clients.documentsClient.updateDocument.post).toHaveBeenCalledWith({
        id: 'doc-1',
        updateData: input.updateData,
      });
      expect(result).toEqual({ ...DOCUMENT, name: 'renamed.pdf' });
    });

    test('updateDocument: rejects anonymous callers with 401 before any client call', async () => {
      const fake = createFakeContext();

      await expect(
        updateDocument(
          null as never,
          { input: { id: 'doc-1', updateData: { name: 'renamed.pdf' } } } as never,
          fake as unknown as GraphQLContext,
        ),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Authentication required' });

      expect(fake.clients.documentsClient.getDocument.post).toHaveBeenCalledTimes(0);
      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledTimes(0);
    });

    test('updateDocument: propagates a rejected ownership check and skips the update', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.documentsClient.getDocument.post.mockImplementation(async () => edenOk(DOCUMENT));
      fake.services.ownership.checkOwnership.mockImplementationOnce(async () => {
        throw new AppError({
          message: 'User does not have required company permissions',
          statusCode: 403,
          code: 'FORBIDDEN',
        });
      });

      await expect(
        updateDocument(
          null as never,
          { input: { id: 'doc-1', updateData: { name: 'renamed.pdf' } } } as never,
          fake as unknown as GraphQLContext,
        ),
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

      expect(fake.clients.documentsClient.updateDocument.post).toHaveBeenCalledTimes(0);
    });

    test('updateDocument: maps a failed document lookup to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.documentsClient.getDocument.post.mockImplementation(async () =>
        edenError(404, 'NOT_FOUND', 'no document'),
      );

      await expect(
        updateDocument(
          null as never,
          { input: { id: 'missing', updateData: { name: 'x' } } } as never,
          fake as unknown as GraphQLContext,
        ),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to get document data' });

      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledTimes(0);
      expect(fake.clients.documentsClient.updateDocument.post).toHaveBeenCalledTimes(0);
    });

    test('updateDocument: maps an upstream update failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.documentsClient.getDocument.post.mockImplementation(async () => edenOk(DOCUMENT));
      fake.clients.documentsClient.updateDocument.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(
        updateDocument(
          null as never,
          { input: { id: 'doc-1', updateData: { name: 'renamed.pdf' } } } as never,
          fake as unknown as GraphQLContext,
        ),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to update document' });
    });
  });

  describe('deleteDocument', () => {
    test('deleteDocument: checks ownership, deletes the file and then the document', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.documentsClient.getDocument.post.mockImplementation(async () => edenOk(DOCUMENT));
      fake.clients.documentsClient.deleteDocument.post.mockImplementation(async () => edenOk({ id: 'doc-1' }));

      const result = await deleteDocument(null as never, { id: 'doc-1' } as never, fake as unknown as GraphQLContext);

      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
        userId: fakeUser.id,
        ownerId: DOCUMENT.ownerId,
        ownerType: DOCUMENT.ownerType,
        permission: 'content',
      });
      expect(fake.clients.filesClient.deleteFile.post).toHaveBeenCalledWith({ id: DOCUMENT.fileId });
      expect(fake.clients.documentsClient.deleteDocument.post).toHaveBeenCalledWith({ id: 'doc-1' });
      expect(result).toBe('doc-1');
    });

    test('deleteDocument: rejects anonymous callers with 401 before any client call', async () => {
      const fake = createFakeContext();

      await expect(
        deleteDocument(null as never, { id: 'doc-1' } as never, fake as unknown as GraphQLContext),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Authentication required' });

      expect(fake.clients.documentsClient.getDocument.post).toHaveBeenCalledTimes(0);
      expect(fake.clients.filesClient.deleteFile.post).toHaveBeenCalledTimes(0);
      expect(fake.clients.documentsClient.deleteDocument.post).toHaveBeenCalledTimes(0);
    });

    test('deleteDocument: maps a failed document lookup to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.documentsClient.getDocument.post.mockImplementation(async () =>
        edenError(404, 'NOT_FOUND', 'no document'),
      );

      await expect(
        deleteDocument(null as never, { id: 'missing' } as never, fake as unknown as GraphQLContext),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to get document data' });

      expect(fake.clients.filesClient.deleteFile.post).toHaveBeenCalledTimes(0);
      expect(fake.clients.documentsClient.deleteDocument.post).toHaveBeenCalledTimes(0);
    });

    test('deleteDocument: maps an upstream delete failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.documentsClient.getDocument.post.mockImplementation(async () => edenOk(DOCUMENT));
      fake.clients.documentsClient.deleteDocument.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(
        deleteDocument(null as never, { id: 'doc-1' } as never, fake as unknown as GraphQLContext),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to delete document' });
    });

    // NOTE (src inconsistency, pinned as-is, not fixed): the resolver ignores the
    // result of clients.filesClient.deleteFile.post, so a failed file deletion
    // still deletes the document row and reports success. Flagged in the report.
    test('deleteDocument: still deletes the document when the file deletion fails', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.documentsClient.getDocument.post.mockImplementation(async () => edenOk(DOCUMENT));
      fake.clients.filesClient.deleteFile.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'file delete failed'),
      );
      fake.clients.documentsClient.deleteDocument.post.mockImplementation(async () => edenOk({ id: 'doc-1' }));

      const result = await deleteDocument(null as never, { id: 'doc-1' } as never, fake as unknown as GraphQLContext);

      expect(fake.clients.documentsClient.deleteDocument.post).toHaveBeenCalledWith({ id: 'doc-1' });
      expect(result).toBe('doc-1');
    });
  });

  describe('createFolder', () => {
    test('createFolder: resolves the parent, checks ownership and forwards the payload', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.services.parent.getParentInfo.mockImplementation(async () => ({
        grandParentId: 'business-1',
        ownerId: 'company-1',
        ownerType: 'company',
      }));
      fake.clients.documentsClient.createFolder.post.mockImplementation(async () => edenOk(FOLDER));

      const result = await createFolder(
        null as never,
        { input: { name: 'Contracts', parentId: 'business-1', type: 'business' } } as never,
        fake as unknown as GraphQLContext,
      );

      expect(fake.services.parent.getParentInfo).toHaveBeenCalledWith('business', 'business-1', fakeUser.id);
      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
        userId: fakeUser.id,
        ownerId: 'company-1',
        ownerType: 'company',
        permission: 'content',
      });
      expect(fake.clients.documentsClient.createFolder.post).toHaveBeenCalledWith({
        name: 'Contracts',
        ownerId: 'company-1',
        ownerType: 'company',
        creator: fakeUser.id,
        parentId: 'business-1',
        grandParentId: 'business-1',
      });
      expect(result).toEqual(FOLDER);
    });

    test('createFolder: rejects anonymous callers with 401 before resolving the parent', async () => {
      const fake = createFakeContext();

      await expect(
        createFolder(
          null as never,
          { input: { name: 'Contracts', parentId: 'business-1', type: 'business' } } as never,
          fake as unknown as GraphQLContext,
        ),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Authentication required' });

      expect(fake.services.parent.getParentInfo).toHaveBeenCalledTimes(0);
      expect(fake.clients.documentsClient.createFolder.post).toHaveBeenCalledTimes(0);
    });

    test('createFolder: propagates a rejected ownership check and skips the create', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.services.parent.getParentInfo.mockImplementation(async () => ({
        grandParentId: 'grand-1',
        ownerId: 'owner-1',
        ownerType: 'user',
      }));
      fake.services.ownership.checkOwnership.mockImplementationOnce(async () => {
        throw new AppError({ message: 'User does not have permission', statusCode: 403, code: 'FORBIDDEN' });
      });

      await expect(
        createFolder(
          null as never,
          { input: { name: 'Contracts', parentId: 'business-1', type: 'business' } } as never,
          fake as unknown as GraphQLContext,
        ),
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

      expect(fake.clients.documentsClient.createFolder.post).toHaveBeenCalledTimes(0);
    });

    test('createFolder: maps an upstream create failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.services.parent.getParentInfo.mockImplementation(async () => ({
        grandParentId: 'business-1',
        ownerId: 'company-1',
        ownerType: 'company',
      }));
      fake.clients.documentsClient.createFolder.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(
        createFolder(
          null as never,
          { input: { name: 'Contracts', parentId: 'business-1', type: 'business' } } as never,
          fake as unknown as GraphQLContext,
        ),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to create folder' });
    });

    // NOTE: the resolver does not remap failures coming from ParentService, so
    // upstream parent errors surface with code UPSTREAM_ERROR (not BAD_GATEWAY
    // like the client failures above). Pinned as-is; flagged in the report.
    test('createFolder: propagates a parent resolution failure untouched', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.services.parent.getParentInfo.mockImplementationOnce(async () => {
        throw new AppError({ message: 'Failed to get business data', statusCode: 502, code: 'UPSTREAM_ERROR' });
      });

      await expect(
        createFolder(
          null as never,
          { input: { name: 'Contracts', parentId: 'business-1', type: 'business' } } as never,
          fake as unknown as GraphQLContext,
        ),
      ).rejects.toMatchObject({ statusCode: 502, code: 'UPSTREAM_ERROR', message: 'Failed to get business data' });

      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledTimes(0);
      expect(fake.clients.documentsClient.createFolder.post).toHaveBeenCalledTimes(0);
    });
  });

  describe('updateFolder', () => {
    test('updateFolder: loads the folder, checks ownership and forwards the update', async () => {
      const fake = createFakeContext({ user: fakeUser });
      const input = { id: 'folder-1', updateData: { name: 'Renamed' } };
      fake.clients.documentsClient.getFolder.post.mockImplementation(async () => edenOk(FOLDER));
      fake.clients.documentsClient.updateFolder.post.mockImplementation(async () =>
        edenOk({ ...FOLDER, name: 'Renamed' }),
      );

      const result = await updateFolder(null as never, { input } as never, fake as unknown as GraphQLContext);

      expect(fake.clients.documentsClient.getFolder.post).toHaveBeenCalledWith({ id: 'folder-1' });
      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
        userId: fakeUser.id,
        ownerId: FOLDER.ownerId,
        ownerType: FOLDER.ownerType,
        permission: 'content',
      });
      expect(fake.clients.documentsClient.updateFolder.post).toHaveBeenCalledWith({
        id: 'folder-1',
        updateData: input.updateData,
      });
      expect(result).toEqual({ ...FOLDER, name: 'Renamed' });
    });

    test('updateFolder: rejects anonymous callers with 401 before any client call', async () => {
      const fake = createFakeContext();

      await expect(
        updateFolder(
          null as never,
          { input: { id: 'folder-1', updateData: { name: 'Renamed' } } } as never,
          fake as unknown as GraphQLContext,
        ),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Authentication required' });

      expect(fake.clients.documentsClient.getFolder.post).toHaveBeenCalledTimes(0);
      expect(fake.clients.documentsClient.updateFolder.post).toHaveBeenCalledTimes(0);
    });

    test('updateFolder: maps a failed folder lookup to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.documentsClient.getFolder.post.mockImplementation(async () =>
        edenError(404, 'NOT_FOUND', 'no folder'),
      );

      await expect(
        updateFolder(
          null as never,
          { input: { id: 'missing', updateData: { name: 'Renamed' } } } as never,
          fake as unknown as GraphQLContext,
        ),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to get folder data' });

      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledTimes(0);
      expect(fake.clients.documentsClient.updateFolder.post).toHaveBeenCalledTimes(0);
    });

    test('updateFolder: maps an upstream update failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.documentsClient.getFolder.post.mockImplementation(async () => edenOk(FOLDER));
      fake.clients.documentsClient.updateFolder.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(
        updateFolder(
          null as never,
          { input: { id: 'folder-1', updateData: { name: 'Renamed' } } } as never,
          fake as unknown as GraphQLContext,
        ),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to update folder' });
    });
  });

  describe('deleteFolder', () => {
    test('deleteFolder: loads the folder, checks ownership and deletes', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.documentsClient.getFolder.post.mockImplementation(async () => edenOk(FOLDER));
      fake.clients.documentsClient.deleteFolder.post.mockImplementation(async () => edenOk({ id: 'folder-1' }));

      const result = await deleteFolder(null as never, { id: 'folder-1' } as never, fake as unknown as GraphQLContext);

      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
        userId: fakeUser.id,
        ownerId: FOLDER.ownerId,
        ownerType: FOLDER.ownerType,
        permission: 'content',
      });
      expect(fake.clients.documentsClient.deleteFolder.post).toHaveBeenCalledWith({ id: 'folder-1' });
      expect(result).toBe('folder-1');
    });

    test('deleteFolder: rejects anonymous callers with 401 before any client call', async () => {
      const fake = createFakeContext();

      await expect(
        deleteFolder(null as never, { id: 'folder-1' } as never, fake as unknown as GraphQLContext),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Authentication required' });

      expect(fake.clients.documentsClient.getFolder.post).toHaveBeenCalledTimes(0);
      expect(fake.clients.documentsClient.deleteFolder.post).toHaveBeenCalledTimes(0);
    });

    test('deleteFolder: maps a failed folder lookup to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.documentsClient.getFolder.post.mockImplementation(async () =>
        edenError(404, 'NOT_FOUND', 'no folder'),
      );

      await expect(
        deleteFolder(null as never, { id: 'missing' } as never, fake as unknown as GraphQLContext),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to get folder data' });

      expect(fake.clients.documentsClient.deleteFolder.post).toHaveBeenCalledTimes(0);
    });

    test('deleteFolder: maps an upstream delete failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.documentsClient.getFolder.post.mockImplementation(async () => edenOk(FOLDER));
      fake.clients.documentsClient.deleteFolder.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(
        deleteFolder(null as never, { id: 'folder-1' } as never, fake as unknown as GraphQLContext),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to delete folder' });
    });
  });
});
