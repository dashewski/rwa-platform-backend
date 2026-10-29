import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { getPostsRequest, getPostsResponse } from '../../models/validation/blogs.validation';

// Private endpoint
export const getPostsController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetPostsController' }).use(servicesPlugin).post(
    '/getPosts',
    async ({ body, blogsService }) => {
      return await blogsService.getPosts(body);
    },
    {
      body: getPostsRequest,
      response: getPostsResponse,
    },
  );
};
