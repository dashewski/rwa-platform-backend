/**
 * Unit tests for the gallery module resolvers (gateway).
 *
 * Resolvers are plain functions that read { clients, services, user } off the
 * GraphQL context, so they are called directly with the fakes from tests/fakes:
 * eden clients resolve in-memory { data, error } envelopes and the inner
 * services are bun:test mocks. No network, no database, no broker.
 */
import { describe, expect, test } from 'bun:test';
import type { GraphQLResolveInfo } from 'graphql';
import { AppError } from '@shared/errors/app-errors';
import type { GraphQLContext } from '../../src/graphql/context/types';
import { edenError, edenOk } from '../fakes/clients.fake';
import { createFakeContext, fakeUser } from '../fakes/context.fake';
import { createGallery } from '../../src/graphql/modules/gallery/resolvers/mutations/createGallery';
import { deleteGallery } from '../../src/graphql/modules/gallery/resolvers/mutations/deleteGallery';
import { deleteImage } from '../../src/graphql/modules/gallery/resolvers/mutations/deleteImage';
import { updateGallery } from '../../src/graphql/modules/gallery/resolvers/mutations/updateGallery';
import { updateImage } from '../../src/graphql/modules/gallery/resolvers/mutations/updateImage';
import { getGalleries } from '../../src/graphql/modules/gallery/resolvers/queries/getGalleries';
import { getGallery } from '../../src/graphql/modules/gallery/resolvers/queries/getGallery';
import { getImage } from '../../src/graphql/modules/gallery/resolvers/queries/getImage';
import { getImages } from '../../src/graphql/modules/gallery/resolvers/queries/getImages';

const INFO = {} as GraphQLResolveInfo;
const GALLERY = {
  id: 'gallery-1',
  name: 'Exterior renders',
  parentId: 'business-1',
  ownerId: 'owner-1',
  ownerType: 'company',
  creator: 'user-1',
  grandParentId: 'grand-1',
  createdAt: 1700000000000,
  updatedAt: 1700000001000,
};

const IMAGE = {
  id: 'image-1',
  galleryId: 'gallery-1',
  name: 'front.png',
  description: 'Front elevation',
  fileId: 'file-9',
  path: 'gallery/front.png',
  url: 'https://files.local/front.png',
  mimeType: 'image/png',
  size: 4096,
  ownerId: 'owner-1',
  ownerType: 'company',
  creator: 'user-1',
  parentId: 'business-1',
  grandParentId: 'grand-1',
  createdAt: 1700000000000,
  updatedAt: 1700000001000,
};

describe('gateway gallery resolvers (unit, fake clients/services)', () => {
  describe('getGallery', () => {
    test('getGallery: forwards the id and maps the gallery', async () => {
      const fake = createFakeContext();
      fake.clients.galleryClient.getGallery.post.mockImplementation(async () =>
        edenOk({ ...GALLERY, internalField: 'must not leak' }),
      );

      const result = await getGallery!(null as never, { id: 'gallery-1' } as never, fake as unknown as GraphQLContext, INFO);

      expect(fake.clients.galleryClient.getGallery.post).toHaveBeenCalledTimes(1);
      expect(fake.clients.galleryClient.getGallery.post).toHaveBeenCalledWith({ id: 'gallery-1' });
      expect(result).toEqual(GALLERY);
    });

    test('getGallery: maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext();
      fake.clients.galleryClient.getGallery.post.mockImplementation(async () =>
        edenError(404, 'NOT_FOUND', 'gallery not found'),
      );

      await expect(
        getGallery!(null as never, { id: 'missing' } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to get gallery' });
    });
  });

  describe('getGalleries', () => {
    test('getGalleries: forwards filter, sort and pagination', async () => {
      const fake = createFakeContext();
      const input = {
        filter: { parentId: 'business-1', ownerId: 'owner-1' },
        sort: { createdAt: -1 },
        limit: 10,
        offset: 20,
      };
      fake.clients.galleryClient.getGalleries.post.mockImplementation(async () => edenOk([GALLERY]));

      const result = await getGalleries!(null as never, { input } as never, fake as unknown as GraphQLContext, INFO);

      expect(fake.clients.galleryClient.getGalleries.post).toHaveBeenCalledTimes(1);
      expect(fake.clients.galleryClient.getGalleries.post).toHaveBeenCalledWith({
        filter: input.filter,
        sort: input.sort,
        limit: 10,
        offset: 20,
      });
      expect(result).toEqual([GALLERY]);
    });

    test('getGalleries: defaults filter and sort to empty objects', async () => {
      const fake = createFakeContext();
      fake.clients.galleryClient.getGalleries.post.mockImplementation(async () => edenOk([]));

      const result = await getGalleries!(null as never, { input: {} } as never, fake as unknown as GraphQLContext, INFO);

      expect(fake.clients.galleryClient.getGalleries.post).toHaveBeenCalledWith({
        filter: {},
        sort: {},
        limit: undefined,
        offset: undefined,
      });
      expect(result).toEqual([]);
    });

    test('getGalleries: maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext();
      fake.clients.galleryClient.getGalleries.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(
        getGalleries!(null as never, { input: { limit: 10 } } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to get galleries' });
    });
  });

  describe('getImage', () => {
    test('getImage: forwards the id and maps the image', async () => {
      const fake = createFakeContext();
      fake.clients.galleryClient.getImage.post.mockImplementation(async () => edenOk(IMAGE));

      const result = await getImage!(null as never, { id: 'image-1' } as never, fake as unknown as GraphQLContext, INFO);

      expect(fake.clients.galleryClient.getImage.post).toHaveBeenCalledWith({ id: 'image-1' });
      expect(result).toEqual(IMAGE);
    });

    test('getImage: maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext();
      fake.clients.galleryClient.getImage.post.mockImplementation(async () =>
        edenError(404, 'NOT_FOUND', 'image not found'),
      );

      await expect(
        getImage!(null as never, { id: 'missing' } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to get image' });
    });
  });

  describe('getImages', () => {
    test('getImages: forwards filter, sort and pagination', async () => {
      const fake = createFakeContext();
      const input = {
        filter: { galleryId: 'gallery-1' },
        sort: { createdAt: 1 },
        limit: 5,
        offset: 5,
      };
      fake.clients.galleryClient.getImages.post.mockImplementation(async () => edenOk([IMAGE]));

      const result = await getImages!(null as never, { input } as never, fake as unknown as GraphQLContext, INFO);

      expect(fake.clients.galleryClient.getImages.post).toHaveBeenCalledWith({
        filter: input.filter,
        sort: input.sort,
        limit: 5,
        offset: 5,
      });
      expect(result).toEqual([IMAGE]);
    });

    test('getImages: defaults filter and sort to empty objects', async () => {
      const fake = createFakeContext();
      fake.clients.galleryClient.getImages.post.mockImplementation(async () => edenOk([]));

      await getImages!(null as never, { input: {} } as never, fake as unknown as GraphQLContext, INFO);

      expect(fake.clients.galleryClient.getImages.post).toHaveBeenCalledWith({
        filter: {},
        sort: {},
        limit: undefined,
        offset: undefined,
      });
    });

    test('getImages: maps an upstream failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext();
      fake.clients.galleryClient.getImages.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(
        getImages!(null as never, { input: {} } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to get images' });
    });
  });

  describe('createGallery', () => {
    test('createGallery: resolves the parent, checks ownership and forwards the payload', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.services.parent.getParentInfo.mockImplementation(async () => ({
        grandParentId: 'business-1',
        ownerId: 'company-1',
        ownerType: 'company',
      }));
      fake.clients.galleryClient.createGallery.post.mockImplementation(async () => edenOk(GALLERY));

      const result = await createGallery!(
        null as never,
        { input: { name: 'Exterior renders', parentId: 'business-1', type: 'business' } } as never,
        fake as unknown as GraphQLContext,
      INFO);

      expect(fake.services.parent.getParentInfo).toHaveBeenCalledWith('business', 'business-1', fakeUser.id);
      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
        userId: fakeUser.id,
        ownerId: 'company-1',
        ownerType: 'company',
        permission: 'content',
      });
      expect(fake.clients.galleryClient.createGallery.post).toHaveBeenCalledWith({
        name: 'Exterior renders',
        ownerId: 'company-1',
        ownerType: 'company',
        creator: fakeUser.id,
        parentId: 'business-1',
        grandParentId: 'business-1',
      });
      expect(result).toEqual(GALLERY);
    });

    test('createGallery: rejects anonymous callers with 401 before resolving the parent', async () => {
      const fake = createFakeContext();

      await expect(
        createGallery!(
          null as never,
          { input: { name: 'Exterior renders', parentId: 'business-1', type: 'business' } } as never,
          fake as unknown as GraphQLContext,
        INFO),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Authentication required' });

      expect(fake.services.parent.getParentInfo).toHaveBeenCalledTimes(0);
      expect(fake.clients.galleryClient.createGallery.post).toHaveBeenCalledTimes(0);
    });

    test('createGallery: propagates a rejected ownership check and skips the create', async () => {
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
        createGallery!(
          null as never,
          { input: { name: 'Exterior renders', parentId: 'business-1', type: 'business' } } as never,
          fake as unknown as GraphQLContext,
        INFO),
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

      expect(fake.clients.galleryClient.createGallery.post).toHaveBeenCalledTimes(0);
    });

    test('createGallery: maps an upstream create failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.services.parent.getParentInfo.mockImplementation(async () => ({
        grandParentId: 'business-1',
        ownerId: 'company-1',
        ownerType: 'company',
      }));
      fake.clients.galleryClient.createGallery.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(
        createGallery!(
          null as never,
          { input: { name: 'Exterior renders', parentId: 'business-1', type: 'business' } } as never,
          fake as unknown as GraphQLContext,
        INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to create gallery' });
    });

    // NOTE: the resolver does not remap failures coming from ParentService, so
    // upstream parent errors surface with code UPSTREAM_ERROR (not BAD_GATEWAY
    // like the client failures above). Pinned as-is; flagged in the report.
    test('createGallery: propagates a parent resolution failure untouched', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.services.parent.getParentInfo.mockImplementationOnce(async () => {
        throw new AppError({ message: 'Failed to get business data', statusCode: 502, code: 'UPSTREAM_ERROR' });
      });

      await expect(
        createGallery!(
          null as never,
          { input: { name: 'Exterior renders', parentId: 'business-1', type: 'business' } } as never,
          fake as unknown as GraphQLContext,
        INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'UPSTREAM_ERROR', message: 'Failed to get business data' });

      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledTimes(0);
      expect(fake.clients.galleryClient.createGallery.post).toHaveBeenCalledTimes(0);
    });
  });

  describe('updateGallery', () => {
    test('updateGallery: loads the gallery, checks ownership and forwards the update', async () => {
      const fake = createFakeContext({ user: fakeUser });
      const input = { id: 'gallery-1', updateData: { name: 'Interior renders' } };
      fake.clients.galleryClient.getGallery.post.mockImplementation(async () => edenOk(GALLERY));
      fake.clients.galleryClient.updateGallery.post.mockImplementation(async () =>
        edenOk({ ...GALLERY, name: 'Interior renders' }),
      );

      const result = await updateGallery!(null as never, { input } as never, fake as unknown as GraphQLContext, INFO);

      expect(fake.clients.galleryClient.getGallery.post).toHaveBeenCalledWith({ id: 'gallery-1' });
      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
        userId: fakeUser.id,
        ownerId: GALLERY.ownerId,
        ownerType: GALLERY.ownerType,
        permission: 'content',
      });
      expect(fake.clients.galleryClient.updateGallery.post).toHaveBeenCalledWith({
        id: 'gallery-1',
        updateData: input.updateData,
      });
      expect(result).toEqual({ ...GALLERY, name: 'Interior renders' });
    });

    test('updateGallery: rejects anonymous callers with 401 before any client call', async () => {
      const fake = createFakeContext();

      await expect(
        updateGallery!(
          null as never,
          { input: { id: 'gallery-1', updateData: { name: 'Interior renders' } } } as never,
          fake as unknown as GraphQLContext,
        INFO),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Authentication required' });

      expect(fake.clients.galleryClient.getGallery.post).toHaveBeenCalledTimes(0);
      expect(fake.clients.galleryClient.updateGallery.post).toHaveBeenCalledTimes(0);
    });

    test('updateGallery: maps a failed gallery lookup to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.galleryClient.getGallery.post.mockImplementation(async () =>
        edenError(404, 'NOT_FOUND', 'no gallery'),
      );

      await expect(
        updateGallery!(
          null as never,
          { input: { id: 'missing', updateData: { name: 'Interior renders' } } } as never,
          fake as unknown as GraphQLContext,
        INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to get gallery data' });

      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledTimes(0);
      expect(fake.clients.galleryClient.updateGallery.post).toHaveBeenCalledTimes(0);
    });

    test('updateGallery: maps an upstream update failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.galleryClient.getGallery.post.mockImplementation(async () => edenOk(GALLERY));
      fake.clients.galleryClient.updateGallery.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(
        updateGallery!(
          null as never,
          { input: { id: 'gallery-1', updateData: { name: 'Interior renders' } } } as never,
          fake as unknown as GraphQLContext,
        INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to update gallery' });
    });
  });

  describe('deleteGallery', () => {
    test('deleteGallery: loads the gallery, checks ownership and deletes', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.galleryClient.getGallery.post.mockImplementation(async () => edenOk(GALLERY));
      fake.clients.galleryClient.deleteGallery.post.mockImplementation(async () => edenOk({ id: 'gallery-1' }));

      const result = await deleteGallery!(
        null as never,
        { id: 'gallery-1' } as never,
        fake as unknown as GraphQLContext,
      INFO);

      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
        userId: fakeUser.id,
        ownerId: GALLERY.ownerId,
        ownerType: GALLERY.ownerType,
        permission: 'content',
      });
      expect(fake.clients.galleryClient.deleteGallery.post).toHaveBeenCalledWith({ id: 'gallery-1' });
      expect(result).toBe('gallery-1');
    });

    test('deleteGallery: rejects anonymous callers with 401 before any client call', async () => {
      const fake = createFakeContext();

      await expect(
        deleteGallery!(null as never, { id: 'gallery-1' } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Authentication required' });

      expect(fake.clients.galleryClient.getGallery.post).toHaveBeenCalledTimes(0);
      expect(fake.clients.galleryClient.deleteGallery.post).toHaveBeenCalledTimes(0);
    });

    test('deleteGallery: maps a failed gallery lookup to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.galleryClient.getGallery.post.mockImplementation(async () =>
        edenError(404, 'NOT_FOUND', 'no gallery'),
      );

      await expect(
        deleteGallery!(null as never, { id: 'missing' } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to get gallery data' });

      expect(fake.clients.galleryClient.deleteGallery.post).toHaveBeenCalledTimes(0);
    });

    test('deleteGallery: maps an upstream delete failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.galleryClient.getGallery.post.mockImplementation(async () => edenOk(GALLERY));
      fake.clients.galleryClient.deleteGallery.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(
        deleteGallery!(null as never, { id: 'gallery-1' } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to delete gallery' });
    });
  });

  describe('updateImage', () => {
    test('updateImage: loads the image, checks ownership and forwards the update', async () => {
      const fake = createFakeContext({ user: fakeUser });
      const input = { id: 'image-1', updateData: { name: 'front-v2.png', description: 'Updated' } };
      fake.clients.galleryClient.getImage.post.mockImplementation(async () => edenOk(IMAGE));
      fake.clients.galleryClient.updateImage.post.mockImplementation(async () =>
        edenOk({ ...IMAGE, name: 'front-v2.png', description: 'Updated' }),
      );

      const result = await updateImage!(null as never, { input } as never, fake as unknown as GraphQLContext, INFO);

      expect(fake.clients.galleryClient.getImage.post).toHaveBeenCalledWith({ id: 'image-1' });
      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
        userId: fakeUser.id,
        ownerId: IMAGE.ownerId,
        ownerType: IMAGE.ownerType,
        permission: 'content',
      });
      expect(fake.clients.galleryClient.updateImage.post).toHaveBeenCalledWith({
        id: 'image-1',
        updateData: input.updateData,
      });
      expect(result).toEqual({ ...IMAGE, name: 'front-v2.png', description: 'Updated' });
    });

    test('updateImage: rejects anonymous callers with 401 before any client call', async () => {
      const fake = createFakeContext();

      await expect(
        updateImage!(
          null as never,
          { input: { id: 'image-1', updateData: { name: 'front-v2.png' } } } as never,
          fake as unknown as GraphQLContext,
        INFO),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Authentication required' });

      expect(fake.clients.galleryClient.getImage.post).toHaveBeenCalledTimes(0);
      expect(fake.clients.galleryClient.updateImage.post).toHaveBeenCalledTimes(0);
    });

    test('updateImage: maps a failed image lookup to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.galleryClient.getImage.post.mockImplementation(async () => edenError(404, 'NOT_FOUND', 'no image'));

      await expect(
        updateImage!(
          null as never,
          { input: { id: 'missing', updateData: { name: 'front-v2.png' } } } as never,
          fake as unknown as GraphQLContext,
        INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to get image data' });

      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledTimes(0);
      expect(fake.clients.galleryClient.updateImage.post).toHaveBeenCalledTimes(0);
    });

    test('updateImage: maps an upstream update failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.galleryClient.getImage.post.mockImplementation(async () => edenOk(IMAGE));
      fake.clients.galleryClient.updateImage.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(
        updateImage!(
          null as never,
          { input: { id: 'image-1', updateData: { name: 'front-v2.png' } } } as never,
          fake as unknown as GraphQLContext,
        INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to update image' });
    });
  });

  describe('deleteImage', () => {
    test('deleteImage: checks ownership, deletes the file and then the image', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.galleryClient.getImage.post.mockImplementation(async () => edenOk(IMAGE));
      fake.clients.galleryClient.deleteImage.post.mockImplementation(async () => edenOk({ id: 'image-1' }));

      const result = await deleteImage!(null as never, { id: 'image-1' } as never, fake as unknown as GraphQLContext, INFO);

      expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
        userId: fakeUser.id,
        ownerId: IMAGE.ownerId,
        ownerType: IMAGE.ownerType,
        permission: 'content',
      });
      expect(fake.clients.filesClient.deleteFile.post).toHaveBeenCalledWith({ id: IMAGE.fileId });
      expect(fake.clients.galleryClient.deleteImage.post).toHaveBeenCalledWith({ id: 'image-1' });
      expect(result).toBe('image-1');
    });

    test('deleteImage: rejects anonymous callers with 401 before any client call', async () => {
      const fake = createFakeContext();

      await expect(
        deleteImage!(null as never, { id: 'image-1' } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Authentication required' });

      expect(fake.clients.galleryClient.getImage.post).toHaveBeenCalledTimes(0);
      expect(fake.clients.filesClient.deleteFile.post).toHaveBeenCalledTimes(0);
      expect(fake.clients.galleryClient.deleteImage.post).toHaveBeenCalledTimes(0);
    });

    test('deleteImage: maps a failed image lookup to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.galleryClient.getImage.post.mockImplementation(async () => edenError(404, 'NOT_FOUND', 'no image'));

      await expect(
        deleteImage!(null as never, { id: 'missing' } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to get image data' });

      expect(fake.clients.filesClient.deleteFile.post).toHaveBeenCalledTimes(0);
      expect(fake.clients.galleryClient.deleteImage.post).toHaveBeenCalledTimes(0);
    });

    test('deleteImage: maps an upstream delete failure to 502 BAD_GATEWAY', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.galleryClient.getImage.post.mockImplementation(async () => edenOk(IMAGE));
      fake.clients.galleryClient.deleteImage.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'boom'),
      );

      await expect(
        deleteImage!(null as never, { id: 'image-1' } as never, fake as unknown as GraphQLContext, INFO),
      ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY', message: 'Failed to delete image' });
    });

    // NOTE (src inconsistency, pinned as-is, not fixed): the resolver ignores the
    // result of clients.filesClient.deleteFile.post, so a failed file deletion
    // still deletes the image row and reports success. Flagged in the report.
    test('deleteImage: still deletes the image when the file deletion fails', async () => {
      const fake = createFakeContext({ user: fakeUser });
      fake.clients.galleryClient.getImage.post.mockImplementation(async () => edenOk(IMAGE));
      fake.clients.filesClient.deleteFile.post.mockImplementation(async () =>
        edenError(500, 'INTERNAL_ERROR', 'file delete failed'),
      );
      fake.clients.galleryClient.deleteImage.post.mockImplementation(async () => edenOk({ id: 'image-1' }));

      const result = await deleteImage!(null as never, { id: 'image-1' } as never, fake as unknown as GraphQLContext, INFO);

      expect(fake.clients.galleryClient.deleteImage.post).toHaveBeenCalledWith({ id: 'image-1' });
      expect(result).toBe('image-1');
    });
  });
});
