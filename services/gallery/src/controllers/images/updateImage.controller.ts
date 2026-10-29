import { Elysia } from 'elysia';
import { type ServicesPlugin } from '../../plugins/services.plugin';
import { updateImageRequest, updateImageResponse } from '../../models/validation/images.validation';

// Private endpoint
export const updateImageController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'UpdateImageController' }).use(servicesPlugin).post(
    '/updateImage',
    async ({ body, imagesService }) => {
      return await imagesService.updateImage(body);
    },
    {
      body: updateImageRequest,
      response: updateImageResponse,
    },
  );
};
