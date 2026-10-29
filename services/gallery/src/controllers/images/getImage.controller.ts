import { Elysia } from 'elysia';
import { type ServicesPlugin } from '../../plugins/services.plugin';
import { getImageRequest, getImageResponse } from '../../models/validation/images.validation';

// Private endpoint
export const getImageController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetImageController' }).use(servicesPlugin).post(
    '/getImage',
    async ({ body, imagesService }) => {
      return await imagesService.getImage(body.id);
    },
    {
      body: getImageRequest,
      response: getImageResponse,
    },
  );
};
