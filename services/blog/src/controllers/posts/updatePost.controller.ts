import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { updatePostRequest, updatePostResponse } from '../../models/validation/blogs.validation';

// Private endpoint
export const updatePostController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'UpdatePostController' }).use(servicesPlugin).post(
    '/updatePost',
    async ({ body, blogsService }) => {
      return await blogsService.updatePost(body);
    },
    {
      body: updatePostRequest,
      response: updatePostResponse,
    },
  );
};
