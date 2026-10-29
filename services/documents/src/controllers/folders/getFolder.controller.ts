import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { getFolderRequest, getFolderResponse } from '../../models/validation/documents.validation';

// Private endpoint
export const getFolderController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetFolderController' }).use(servicesPlugin).post(
    '/getFolder',
    async ({ body, documentsService }) => {
      return await documentsService.getFolder(body.id);
    },
    {
      body: getFolderRequest,
      response: getFolderResponse,
    },
  );
};
