import { Elysia } from 'elysia';
import { type ServicesPlugin } from '../../plugins/services.plugin';
import { createGalleryRequest, createGalleryResponse } from '../../models/validation/images.validation';

// Private endpoint
export const createGalleryController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'CreateGalleryController' }).use(servicesPlugin).post(
    '/createGallery',
    async ({ body, imagesService }) => {
      return await imagesService.createGallery(body);
    },
    {
      body: createGalleryRequest,
      response: createGalleryResponse,
    },
  );
};
