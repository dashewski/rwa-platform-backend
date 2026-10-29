import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { updateBusinessImageRequest, updateBusinessImageResponse } from '../../models/validation/business.validation';

// Private endpoint
export const updateBusinessImageController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'UpdateBusinessImageController' }).use(servicesPlugin).post(
    '/updateBusinessImage',
    async ({ body, businessService }) => {
      return await businessService.updateBusinessImage(body);
    },
    {
      body: updateBusinessImageRequest,
      response: updateBusinessImageResponse,
    },
  );
};
