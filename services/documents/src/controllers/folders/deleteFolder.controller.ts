import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { deleteFolderRequest, deleteFolderResponse } from '../../models/validation/documents.validation';

// Private endpoint
export const deleteFolderController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'DeleteFolderController' }).use(servicesPlugin).post(
    '/deleteFolder',
    async ({ body, documentsService }) => {
      return await documentsService.deleteFolder(body.id);
    },
    {
      body: deleteFolderRequest,
      response: deleteFolderResponse,
    },
  );
};
