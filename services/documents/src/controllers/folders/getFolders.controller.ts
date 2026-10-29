import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { getFoldersRequest, getFoldersResponse } from '../../models/validation/documents.validation';

// Private endpoint
export const getFoldersController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetFoldersController' }).use(servicesPlugin).post(
    '/getFolders',
    async ({ body, documentsService }) => {
      return await documentsService.getFolders(body);
    },
    {
      body: getFoldersRequest,
      response: getFoldersResponse,
    },
  );
};
