import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { getDocumentRequest, getDocumentResponse } from '../../models/validation/documents.validation';

// Private endpoint
export const getDocumentController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetDocumentController' }).use(servicesPlugin).post(
    '/getDocument',
    async ({ body, documentsService }) => {
      return await documentsService.getDocument(body.id);
    },
    {
      body: getDocumentRequest,
      response: getDocumentResponse,
    },
  );
};
