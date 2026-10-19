/**
 * Isolated resolver tests for the gateway blog module.
 *
 * Resolvers are plain functions invoked directly with a fake GraphQL context:
 * eden clients and inner services are in-memory fakes from tests/fakes/*.
 * No network, no database, no broker, no ports.
 */
import { describe, expect, test } from 'bun:test';
import { AppError } from '@shared/errors/app-errors';
import type { GraphQLContext } from '../../src/graphql/context/types';
import { createFakeContext, fakeUser } from '../fakes/context.fake';
import { edenError, edenOk } from '../fakes/clients.fake';
import { getBlog } from '../../src/graphql/modules/blog/resolvers/queries/getBlog';
import { getBlogs } from '../../src/graphql/modules/blog/resolvers/queries/getBlogs';
import { getPost } from '../../src/graphql/modules/blog/resolvers/queries/getPost';
import { getPosts } from '../../src/graphql/modules/blog/resolvers/queries/getPosts';
import { createBlog } from '../../src/graphql/modules/blog/resolvers/mutations/createBlog';
import { updateBlog } from '../../src/graphql/modules/blog/resolvers/mutations/updateBlog';
import { deleteBlog } from '../../src/graphql/modules/blog/resolvers/mutations/deleteBlog';
import { createPost } from '../../src/graphql/modules/blog/resolvers/mutations/createPost';
import { updatePost } from '../../src/graphql/modules/blog/resolvers/mutations/updatePost';
import { deletePost } from '../../src/graphql/modules/blog/resolvers/mutations/deletePost';

const BLOG = {
  id: 'blog-1',
  name: 'Updates',
  ownerId: 'owner-1',
  ownerType: 'business',
  creator: 'user-1',
  parentId: 'parent-1',
  grandParentId: 'grand-1',
  createdAt: 1000,
  updatedAt: 2000,
};

/** Upstream rows carry storage-only fields that the gateway must not leak. */
const UPSTREAM_BLOG = { ...BLOG, _id: 'mongo-blog-1' };
const UPSTREAM_BLOG_2 = { ...BLOG, id: 'blog-2', name: 'Second', _id: 'mongo-blog-2' };

const POST = {
  id: 'post-1',
  blogId: 'blog-1',
  title: 'Hello',
  content: 'Body',
  images: ['img-1'],
  documents: ['doc-1'],
  ownerId: 'owner-1',
  ownerType: 'business',
  creator: 'user-1',
  parentId: 'parent-1',
  grandParentId: 'grand-1',
  createdAt: 1000,
  updatedAt: 2000,
};

const PARENT_INFO = { grandParentId: 'grand-1', ownerId: 'owner-1', ownerType: 'business' };

const CREATE_BLOG_INPUT = { name: 'Updates', parentId: 'parent-1', type: 'business' };
const CREATE_POST_INPUT = {
  blogId: 'blog-1',
  title: 'Hello',
  content: 'Body',
  images: ['img-1'],
  documents: ['doc-1'],
};

describe('gateway blog resolvers (unit, fake clients/services)', () => {
  // Query.getBlog -----------------------------------------------------------
  test('getBlog: forwards the id and maps the blog fields', async () => {
    const fake = createFakeContext();
    fake.clients.blogClient.getBlog.post.mockImplementation(async () => edenOk(UPSTREAM_BLOG));

    const result = await getBlog(null as never, { id: 'blog-1' } as never, fake as unknown as GraphQLContext);

    expect(fake.clients.blogClient.getBlog.post).toHaveBeenCalledWith({ id: 'blog-1' });
    expect(result).toEqual(BLOG); // storage-only fields such as `_id` are dropped
  });

  test('getBlog: maps an upstream error to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext();
    fake.clients.blogClient.getBlog.post.mockImplementation(async () => edenError(404, 'NOT_FOUND', 'no blog'));

    await expect(
      getBlog(null as never, { id: 'missing' } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
  });

  // Query.getBlogs ----------------------------------------------------------
  test('getBlogs: forwards filter, sort and pagination and maps every blog', async () => {
    const fake = createFakeContext();
    fake.clients.blogClient.getBlogs.post.mockImplementation(async () => edenOk([UPSTREAM_BLOG, UPSTREAM_BLOG_2]));

    const input = { filter: { ownerId: 'owner-1' }, sort: { createdAt: -1 }, limit: 10, offset: 5 };
    const result = await getBlogs(null as never, { input } as never, fake as unknown as GraphQLContext);

    expect(fake.clients.blogClient.getBlogs.post).toHaveBeenCalledWith({
      filter: { ownerId: 'owner-1' },
      sort: { createdAt: -1 },
      limit: 10,
      offset: 5,
    });
    expect(result).toEqual([BLOG, { ...BLOG, id: 'blog-2', name: 'Second' }]);
  });

  test('getBlogs: defaults filter and sort to empty objects when input is omitted', async () => {
    const fake = createFakeContext();
    fake.clients.blogClient.getBlogs.post.mockImplementation(async () => edenOk([]));

    const result = await getBlogs(null as never, {} as never, fake as unknown as GraphQLContext);

    expect(fake.clients.blogClient.getBlogs.post).toHaveBeenCalledWith({
      filter: {},
      sort: {},
      limit: undefined,
      offset: undefined,
    });
    expect(result).toEqual([]);
  });

  test('getBlogs: maps an upstream error to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext();
    fake.clients.blogClient.getBlogs.post.mockImplementation(async () => edenError(500, 'INTERNAL_ERROR', 'boom'));

    await expect(
      getBlogs(null as never, { input: {} } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
  });

  // Query.getPost -----------------------------------------------------------
  test('getPost: forwards the id and returns the post as-is', async () => {
    const fake = createFakeContext();
    fake.clients.blogClient.getPost.post.mockImplementation(async () => edenOk(POST));

    const result = await getPost(null as never, { id: 'post-1' } as never, fake as unknown as GraphQLContext);

    expect(fake.clients.blogClient.getPost.post).toHaveBeenCalledWith({ id: 'post-1' });
    expect(result).toEqual(POST);
  });

  test('getPost: maps an upstream error to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext();
    fake.clients.blogClient.getPost.post.mockImplementation(async () => edenError(404, 'NOT_FOUND', 'no post'));

    await expect(
      getPost(null as never, { id: 'missing' } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
  });

  // Query.getPosts ----------------------------------------------------------
  test('getPosts: forwards filter, sort and pagination and returns the posts as-is', async () => {
    const fake = createFakeContext();
    fake.clients.blogClient.getPosts.post.mockImplementation(async () => edenOk([POST]));

    const input = { filter: { blogId: 'blog-1' }, sort: { createdAt: -1 }, limit: 20, offset: 40 };
    const result = await getPosts(null as never, { input } as never, fake as unknown as GraphQLContext);

    expect(fake.clients.blogClient.getPosts.post).toHaveBeenCalledWith({
      filter: { blogId: 'blog-1' },
      sort: { createdAt: -1 },
      limit: 20,
      offset: 40,
    });
    expect(result).toEqual([POST]);
  });

  test('getPosts: defaults filter and sort to empty objects when input is omitted', async () => {
    const fake = createFakeContext();
    fake.clients.blogClient.getPosts.post.mockImplementation(async () => edenOk([]));

    const result = await getPosts(null as never, {} as never, fake as unknown as GraphQLContext);

    expect(fake.clients.blogClient.getPosts.post).toHaveBeenCalledWith({
      filter: {},
      sort: {},
      limit: undefined,
      offset: undefined,
    });
    expect(result).toEqual([]);
  });

  test('getPosts: maps an upstream error to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext();
    fake.clients.blogClient.getPosts.post.mockImplementation(async () => edenError(500, 'INTERNAL_ERROR', 'boom'));

    await expect(
      getPosts(null as never, { input: {} } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
  });

  // Mutation.createBlog -----------------------------------------------------
  test('createBlog: rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
    const fake = createFakeContext();

    await expect(
      createBlog(null as never, { input: CREATE_BLOG_INPUT } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

    expect(fake.services.parent.getParentInfo).toHaveBeenCalledTimes(0);
    expect(fake.services.ownership.checkOwnership).toHaveBeenCalledTimes(0);
    expect(fake.clients.blogClient.createBlog.post).toHaveBeenCalledTimes(0);
  });

  test('createBlog: resolves the owner via parent info, checks ownership and forwards the payload', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.services.parent.getParentInfo.mockImplementation(async () => PARENT_INFO);
    fake.clients.blogClient.createBlog.post.mockImplementation(async () => edenOk(UPSTREAM_BLOG));

    const result = await createBlog(
      null as never,
      { input: CREATE_BLOG_INPUT } as never,
      fake as unknown as GraphQLContext,
    );

    expect(fake.services.parent.getParentInfo).toHaveBeenCalledWith('business', 'parent-1', 'user-1');
    expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
      userId: 'user-1',
      ownerId: 'owner-1',
      ownerType: 'business',
      permission: 'content',
    });
    expect(fake.clients.blogClient.createBlog.post).toHaveBeenCalledWith({
      name: 'Updates',
      ownerId: 'owner-1',
      ownerType: 'business',
      creator: 'user-1',
      parentId: 'parent-1',
      grandParentId: 'grand-1',
    });
    expect(result).toEqual(BLOG);
  });

  test('createBlog: propagates a 403 from the ownership check and never calls the client', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.services.parent.getParentInfo.mockImplementation(async () => PARENT_INFO);
    fake.services.ownership.checkOwnership.mockImplementation(async () => {
      throw new AppError({ message: 'User does not have permission', statusCode: 403, code: 'FORBIDDEN' });
    });

    await expect(
      createBlog(null as never, { input: CREATE_BLOG_INPUT } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

    expect(fake.clients.blogClient.createBlog.post).toHaveBeenCalledTimes(0);
  });

  test('createBlog: maps an upstream error to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.services.parent.getParentInfo.mockImplementation(async () => PARENT_INFO);
    fake.clients.blogClient.createBlog.post.mockImplementation(async () => edenError(500, 'INTERNAL_ERROR', 'boom'));

    await expect(
      createBlog(null as never, { input: CREATE_BLOG_INPUT } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
  });

  // Mutation.updateBlog -----------------------------------------------------
  test('updateBlog: rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
    const fake = createFakeContext();

    await expect(
      updateBlog(
        null as never,
        { input: { id: 'blog-1', updateData: { name: 'Renamed' } } } as never,
        fake as unknown as GraphQLContext,
      ),
    ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

    expect(fake.clients.blogClient.getBlog.post).toHaveBeenCalledTimes(0);
    expect(fake.clients.blogClient.updateBlog.post).toHaveBeenCalledTimes(0);
  });

  test('updateBlog: loads the blog, checks ownership and forwards the update', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.blogClient.getBlog.post.mockImplementation(async () => edenOk(UPSTREAM_BLOG));
    fake.clients.blogClient.updateBlog.post.mockImplementation(async () =>
      edenOk({ ...UPSTREAM_BLOG, name: 'Renamed' }),
    );

    const input = { id: 'blog-1', updateData: { name: 'Renamed' } };
    const result = await updateBlog(null as never, { input } as never, fake as unknown as GraphQLContext);

    expect(fake.clients.blogClient.getBlog.post).toHaveBeenCalledWith({ id: 'blog-1' });
    expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
      userId: 'user-1',
      ownerId: 'owner-1',
      ownerType: 'business',
      permission: 'content',
    });
    expect(fake.clients.blogClient.updateBlog.post).toHaveBeenCalledWith({
      id: 'blog-1',
      updateData: { name: 'Renamed' },
    });
    expect(result).toEqual({ ...BLOG, name: 'Renamed' });
  });

  test('updateBlog: maps a failed blog lookup to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.blogClient.getBlog.post.mockImplementation(async () => edenError(404, 'NOT_FOUND', 'no blog'));

    await expect(
      updateBlog(
        null as never,
        { input: { id: 'missing', updateData: { name: 'Renamed' } } } as never,
        fake as unknown as GraphQLContext,
      ),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });

    expect(fake.services.ownership.checkOwnership).toHaveBeenCalledTimes(0);
    expect(fake.clients.blogClient.updateBlog.post).toHaveBeenCalledTimes(0);
  });

  test('updateBlog: propagates a 403 from the ownership check and never updates', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.blogClient.getBlog.post.mockImplementation(async () => edenOk(UPSTREAM_BLOG));
    fake.services.ownership.checkOwnership.mockImplementation(async () => {
      throw new AppError({ message: 'User does not have permission', statusCode: 403, code: 'FORBIDDEN' });
    });

    await expect(
      updateBlog(
        null as never,
        { input: { id: 'blog-1', updateData: { name: 'Renamed' } } } as never,
        fake as unknown as GraphQLContext,
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

    expect(fake.clients.blogClient.updateBlog.post).toHaveBeenCalledTimes(0);
  });

  test('updateBlog: maps an upstream error to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.blogClient.getBlog.post.mockImplementation(async () => edenOk(UPSTREAM_BLOG));
    fake.clients.blogClient.updateBlog.post.mockImplementation(async () => edenError(500, 'INTERNAL_ERROR', 'boom'));

    await expect(
      updateBlog(
        null as never,
        { input: { id: 'blog-1', updateData: { name: 'Renamed' } } } as never,
        fake as unknown as GraphQLContext,
      ),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
  });

  // Mutation.deleteBlog -----------------------------------------------------
  test('deleteBlog: rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
    const fake = createFakeContext();

    await expect(
      deleteBlog(null as never, { id: 'blog-1' } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

    expect(fake.clients.blogClient.deleteBlog.post).toHaveBeenCalledTimes(0);
  });

  test('deleteBlog: loads the blog, checks ownership and returns the deleted id', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.blogClient.getBlog.post.mockImplementation(async () => edenOk(UPSTREAM_BLOG));
    fake.clients.blogClient.deleteBlog.post.mockImplementation(async () => edenOk({ id: 'blog-1' }));

    const result = await deleteBlog(null as never, { id: 'blog-1' } as never, fake as unknown as GraphQLContext);

    expect(fake.clients.blogClient.getBlog.post).toHaveBeenCalledWith({ id: 'blog-1' });
    expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
      userId: 'user-1',
      ownerId: 'owner-1',
      ownerType: 'business',
      permission: 'content',
    });
    expect(fake.clients.blogClient.deleteBlog.post).toHaveBeenCalledWith({ id: 'blog-1' });
    expect(result).toBe('blog-1');
  });

  test('deleteBlog: maps a failed blog lookup to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.blogClient.getBlog.post.mockImplementation(async () => edenError(404, 'NOT_FOUND', 'no blog'));

    await expect(
      deleteBlog(null as never, { id: 'missing' } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });

    expect(fake.clients.blogClient.deleteBlog.post).toHaveBeenCalledTimes(0);
  });

  test('deleteBlog: maps an upstream error to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.blogClient.getBlog.post.mockImplementation(async () => edenOk(UPSTREAM_BLOG));
    fake.clients.blogClient.deleteBlog.post.mockImplementation(async () => edenError(500, 'INTERNAL_ERROR', 'boom'));

    await expect(
      deleteBlog(null as never, { id: 'blog-1' } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
  });

  // Mutation.createPost -----------------------------------------------------
  test('createPost: rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
    const fake = createFakeContext();

    await expect(
      createPost(null as never, { input: CREATE_POST_INPUT } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

    expect(fake.clients.blogClient.getBlog.post).toHaveBeenCalledTimes(0);
    expect(fake.clients.blogClient.createPost.post).toHaveBeenCalledTimes(0);
  });

  test('createPost: loads the blog, checks ownership and forwards the post payload', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.blogClient.getBlog.post.mockImplementation(async () => edenOk(UPSTREAM_BLOG));
    fake.clients.blogClient.createPost.post.mockImplementation(async () => edenOk(POST));

    const result = await createPost(
      null as never,
      { input: CREATE_POST_INPUT } as never,
      fake as unknown as GraphQLContext,
    );

    expect(fake.clients.blogClient.getBlog.post).toHaveBeenCalledWith({ id: 'blog-1' });
    expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
      userId: 'user-1',
      ownerId: 'owner-1',
      ownerType: 'business',
      permission: 'content',
    });
    expect(fake.clients.blogClient.createPost.post).toHaveBeenCalledWith({
      title: 'Hello',
      content: 'Body',
      images: ['img-1'],
      documents: ['doc-1'],
      ownerId: 'owner-1',
      ownerType: 'business',
      creator: 'user-1',
      parentId: 'parent-1',
      grandParentId: 'grand-1',
      blogId: 'blog-1',
    });
    expect(result).toEqual(POST);
  });

  test('createPost: maps a failed blog lookup to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.blogClient.getBlog.post.mockImplementation(async () => edenError(404, 'NOT_FOUND', 'no blog'));

    await expect(
      createPost(null as never, { input: CREATE_POST_INPUT } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });

    expect(fake.clients.blogClient.createPost.post).toHaveBeenCalledTimes(0);
  });

  test('createPost: propagates a 403 from the ownership check and never creates', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.blogClient.getBlog.post.mockImplementation(async () => edenOk(UPSTREAM_BLOG));
    fake.services.ownership.checkOwnership.mockImplementation(async () => {
      throw new AppError({ message: 'User does not have permission', statusCode: 403, code: 'FORBIDDEN' });
    });

    await expect(
      createPost(null as never, { input: CREATE_POST_INPUT } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

    expect(fake.clients.blogClient.createPost.post).toHaveBeenCalledTimes(0);
  });

  test('createPost: maps an upstream error to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.blogClient.getBlog.post.mockImplementation(async () => edenOk(UPSTREAM_BLOG));
    fake.clients.blogClient.createPost.post.mockImplementation(async () => edenError(500, 'INTERNAL_ERROR', 'boom'));

    await expect(
      createPost(null as never, { input: CREATE_POST_INPUT } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
  });

  // Mutation.updatePost -----------------------------------------------------
  test('updatePost: rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
    const fake = createFakeContext();

    await expect(
      updatePost(
        null as never,
        { input: { id: 'post-1', updateData: { title: 'Edited' } } } as never,
        fake as unknown as GraphQLContext,
      ),
    ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

    expect(fake.clients.blogClient.getPost.post).toHaveBeenCalledTimes(0);
    expect(fake.clients.blogClient.updatePost.post).toHaveBeenCalledTimes(0);
  });

  test('updatePost: loads the post, checks ownership and forwards the update', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.blogClient.getPost.post.mockImplementation(async () => edenOk(POST));
    fake.clients.blogClient.updatePost.post.mockImplementation(async () => edenOk({ ...POST, title: 'Edited' }));

    const input = { id: 'post-1', updateData: { title: 'Edited' } };
    const result = await updatePost(null as never, { input } as never, fake as unknown as GraphQLContext);

    expect(fake.clients.blogClient.getPost.post).toHaveBeenCalledWith({ id: 'post-1' });
    expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
      userId: 'user-1',
      ownerId: 'owner-1',
      ownerType: 'business',
      permission: 'content',
    });
    expect(fake.clients.blogClient.updatePost.post).toHaveBeenCalledWith({
      id: 'post-1',
      updateData: { title: 'Edited' },
    });
    expect(result).toEqual({ ...POST, title: 'Edited' });
  });

  test('updatePost: maps a failed post lookup to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.blogClient.getPost.post.mockImplementation(async () => edenError(404, 'NOT_FOUND', 'no post'));

    await expect(
      updatePost(
        null as never,
        { input: { id: 'missing', updateData: { title: 'Edited' } } } as never,
        fake as unknown as GraphQLContext,
      ),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });

    expect(fake.clients.blogClient.updatePost.post).toHaveBeenCalledTimes(0);
  });

  test('updatePost: propagates a 403 from the ownership check and never updates', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.blogClient.getPost.post.mockImplementation(async () => edenOk(POST));
    fake.services.ownership.checkOwnership.mockImplementation(async () => {
      throw new AppError({ message: 'User does not have permission', statusCode: 403, code: 'FORBIDDEN' });
    });

    await expect(
      updatePost(
        null as never,
        { input: { id: 'post-1', updateData: { title: 'Edited' } } } as never,
        fake as unknown as GraphQLContext,
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

    expect(fake.clients.blogClient.updatePost.post).toHaveBeenCalledTimes(0);
  });

  test('updatePost: maps an upstream error to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.blogClient.getPost.post.mockImplementation(async () => edenOk(POST));
    fake.clients.blogClient.updatePost.post.mockImplementation(async () => edenError(500, 'INTERNAL_ERROR', 'boom'));

    await expect(
      updatePost(
        null as never,
        { input: { id: 'post-1', updateData: { title: 'Edited' } } } as never,
        fake as unknown as GraphQLContext,
      ),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
  });

  // Mutation.deletePost -----------------------------------------------------
  test('deletePost: rejects an anonymous caller with 401 UNAUTHORIZED', async () => {
    const fake = createFakeContext();

    await expect(
      deletePost(null as never, { id: 'post-1' } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

    expect(fake.clients.blogClient.deletePost.post).toHaveBeenCalledTimes(0);
  });

  test('deletePost: loads the post, checks ownership and returns the deleted id', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.blogClient.getPost.post.mockImplementation(async () => edenOk(POST));
    fake.clients.blogClient.deletePost.post.mockImplementation(async () => edenOk({ id: 'post-1' }));

    const result = await deletePost(null as never, { id: 'post-1' } as never, fake as unknown as GraphQLContext);

    expect(fake.clients.blogClient.getPost.post).toHaveBeenCalledWith({ id: 'post-1' });
    expect(fake.services.ownership.checkOwnership).toHaveBeenCalledWith({
      userId: 'user-1',
      ownerId: 'owner-1',
      ownerType: 'business',
      permission: 'content',
    });
    expect(fake.clients.blogClient.deletePost.post).toHaveBeenCalledWith({ id: 'post-1' });
    expect(result).toBe('post-1');
  });

  test('deletePost: maps a failed post lookup to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.blogClient.getPost.post.mockImplementation(async () => edenError(404, 'NOT_FOUND', 'no post'));

    await expect(
      deletePost(null as never, { id: 'missing' } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });

    expect(fake.clients.blogClient.deletePost.post).toHaveBeenCalledTimes(0);
  });

  test('deletePost: maps an upstream error to 502 BAD_GATEWAY', async () => {
    const fake = createFakeContext({ user: fakeUser });
    fake.clients.blogClient.getPost.post.mockImplementation(async () => edenOk(POST));
    fake.clients.blogClient.deletePost.post.mockImplementation(async () => edenError(500, 'INTERNAL_ERROR', 'boom'));

    await expect(
      deletePost(null as never, { id: 'post-1' } as never, fake as unknown as GraphQLContext),
    ).rejects.toMatchObject({ statusCode: 502, code: 'BAD_GATEWAY' });
  });
});
