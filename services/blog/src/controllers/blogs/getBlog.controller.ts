import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { getBlogRequest, getBlogResponse } from '../../models/validation/blogs.validation';

// Private endpoint
export const getBlogController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetBlogController' }).use(servicesPlugin).post(
    '/getBlog',
    async ({ body, blogsService }) => {
      return await blogsService.getBlog(body.id);
    },
    {
      body: getBlogRequest,
      response: getBlogResponse,
    },
  );
};
