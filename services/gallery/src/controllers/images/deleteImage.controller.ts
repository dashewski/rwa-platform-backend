import { Elysia } from 'elysia';
import { type ServicesPlugin } from '../../plugins/services.plugin';
import { deleteImageRequest, deleteImageResponse } from '../../models/validation/images.validation';

// Private endpoint
export const deleteImageController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'DeleteImageController' }).use(servicesPlugin).post(
    '/deleteImage',
    async ({ body, imagesService }) => {
      return await imagesService.deleteImage(body.id);
    },
    {
      body: deleteImageRequest,
      response: deleteImageResponse,
    },
  );
};
