import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { updatePoolImageRequest, updatePoolImageResponse } from '../../models/validation/pool.validation';

// Private endpoint
export const updatePoolImageController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'UpdatePoolImageController' }).use(servicesPlugin).post(
    '/updatePoolImage',
    async ({ body, poolService }) => {
      return await poolService.updatePoolImage(body);
    },
    {
      body: updatePoolImageRequest,
      response: updatePoolImageResponse,
    },
  );
};
