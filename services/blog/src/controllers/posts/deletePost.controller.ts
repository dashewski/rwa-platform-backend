import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { deletePostRequest, deletePostResponse } from '../../models/validation/blogs.validation';

// Private endpoint
export const deletePostController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'DeletePostController' }).use(servicesPlugin).post(
    '/deletePost',
    async ({ body, blogsService }) => {
      return await blogsService.deletePost(body.id);
    },
    {
      body: deletePostRequest,
      response: deletePostResponse,
    },
  );
};
