import { Elysia } from 'elysia';
import { type ServicesPlugin } from '../../plugins/services.plugin';
import { getGalleryRequest, getGalleryResponse } from '../../models/validation/images.validation';

// Private endpoint
export const getGalleryController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetGalleryController' }).use(servicesPlugin).post(
    '/getGallery',
    async ({ body, imagesService }) => {
      return await imagesService.getGallery(body.id);
    },
    {
      body: getGalleryRequest,
      response: getGalleryResponse,
    },
  );
};
