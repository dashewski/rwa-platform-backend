import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { updateDocumentRequest, updateDocumentResponse } from '../../models/validation/documents.validation';

// Private endpoint
export const updateDocumentController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'UpdateDocumentController' }).use(servicesPlugin).post(
    '/updateDocument',
    async ({ body, documentsService }) => {
      return await documentsService.updateDocument(body);
    },
    {
      body: updateDocumentRequest,
      response: updateDocumentResponse,
    },
  );
};
