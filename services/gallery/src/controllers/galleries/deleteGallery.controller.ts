import { Elysia } from 'elysia';
import { type ServicesPlugin } from '../../plugins/services.plugin';
import { deleteGalleryRequest, deleteGalleryResponse } from '../../models/validation/images.validation';

// Private endpoint
export const deleteGalleryController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'DeleteGalleryController' }).use(servicesPlugin).post(
    '/deleteGallery',
    async ({ body, imagesService }) => {
      return await imagesService.deleteGallery(body.id);
    },
    {
      body: deleteGalleryRequest,
      response: deleteGalleryResponse,
    },
  );
};
