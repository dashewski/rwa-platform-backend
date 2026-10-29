import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { deleteDocumentRequest, deleteDocumentResponse } from '../../models/validation/documents.validation';

// Private endpoint
export const deleteDocumentController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'DeleteDocumentController' }).use(servicesPlugin).post(
    '/deleteDocument',
    async ({ body, documentsService }) => {
      return await documentsService.deleteDocument(body.id);
    },
    {
      body: deleteDocumentRequest,
      response: deleteDocumentResponse,
    },
  );
};
