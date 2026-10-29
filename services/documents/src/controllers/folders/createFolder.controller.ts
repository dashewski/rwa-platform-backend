import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { createFolderRequest, createFolderResponse } from '../../models/validation/documents.validation';

// Private endpoint
export const createFolderController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'CreateFolderController' }).use(servicesPlugin).post(
    '/createFolder',
    async ({ body, documentsService }) => {
      return await documentsService.createFolder(body);
    },
    {
      body: createFolderRequest,
      response: createFolderResponse,
    },
  );
};
