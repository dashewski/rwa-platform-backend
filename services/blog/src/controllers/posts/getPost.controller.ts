import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { getPostRequest, getPostResponse } from '../../models/validation/blogs.validation';

// Private endpoint
export const getPostController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetPostController' }).use(servicesPlugin).post(
    '/getPost',
    async ({ body, blogsService }) => {
      return await blogsService.getPost(body.id);
    },
    {
      body: getPostRequest,
      response: getPostResponse,
    },
  );
};
