import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { createBlogRequest, createBlogResponse } from '../../models/validation/blogs.validation';

// Private endpoint
export const createBlogController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'CreateBlogController' }).use(servicesPlugin).post(
    '/createBlog',
    async ({ body, blogsService }) => {
      return await blogsService.createBlog(body);
    },
    {
      body: createBlogRequest,
      response: createBlogResponse,
    },
  );
};
