import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { getBlogsRequest, getBlogsResponse } from '../../models/validation/blogs.validation';

// Private endpoint
export const getBlogsController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetBlogsController' }).use(servicesPlugin).post(
    '/getBlogs',
    async ({ body, blogsService }) => {
      return await blogsService.getBlogs(body);
    },
    {
      body: getBlogsRequest,
      response: getBlogsResponse,
    },
  );
};
