import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { createPostRequest, createPostResponse } from '../../models/validation/blogs.validation';

// Private endpoint
export const createPostController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'CreatePostController' }).use(servicesPlugin).post(
    '/createPost',
    async ({ body, blogsService }) => {
      return await blogsService.createPost(body);
    },
    {
      body: createPostRequest,
      response: createPostResponse,
    },
  );
};
