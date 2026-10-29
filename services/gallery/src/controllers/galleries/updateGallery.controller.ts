import { Elysia } from 'elysia';
import { type ServicesPlugin } from '../../plugins/services.plugin';
import { updateGalleryRequest, updateGalleryResponse } from '../../models/validation/images.validation';

// Private endpoint
export const updateGalleryController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'UpdateGalleryController' }).use(servicesPlugin).post(
    '/updateGallery',
    async ({ body, imagesService }) => {
      return await imagesService.updateGallery(body);
    },
    {
      body: updateGalleryRequest,
      response: updateGalleryResponse,
    },
  );
};
