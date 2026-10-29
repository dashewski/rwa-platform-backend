import { Elysia } from 'elysia';
import { type ServicesPlugin } from '../../plugins/services.plugin';
import { createImageRequest, createImageResponse } from '../../models/validation/images.validation';

// Private endpoint
export const createImageController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'CreateImageController' }).use(servicesPlugin).post(
    '/createImage',
    async ({ body, imagesService }) => {
      return await imagesService.createImage(body);
    },
    {
      body: createImageRequest,
      response: createImageResponse,
    },
  );
};
