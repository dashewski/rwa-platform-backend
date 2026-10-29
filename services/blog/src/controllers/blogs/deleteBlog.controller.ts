import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { deleteBlogRequest, deleteBlogResponse } from '../../models/validation/blogs.validation';

// Private endpoint
export const deleteBlogController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'DeleteBlogController' }).use(servicesPlugin).post(
    '/deleteBlog',
    async ({ body, blogsService }) => {
      return await blogsService.deleteBlog(body.id);
    },
    {
      body: deleteBlogRequest,
      response: deleteBlogResponse,
    },
  );
};
