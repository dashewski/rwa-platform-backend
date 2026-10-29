import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { updateBlogRequest, updateBlogResponse } from '../../models/validation/blogs.validation';

// Private endpoint
export const updateBlogController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'UpdateBlogController' }).use(servicesPlugin).post(
    '/updateBlog',
    async ({ body, blogsService }) => {
      return await blogsService.updateBlog(body);
    },
    {
      body: updateBlogRequest,
      response: updateBlogResponse,
    },
  );
};
