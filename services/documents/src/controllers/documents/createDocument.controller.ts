import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { createDocumentRequest, createDocumentResponse } from '../../models/validation/documents.validation';

// Private endpoint
export const createDocumentController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'CreateDocumentController' }).use(servicesPlugin).post(
    '/createDocument',
    async ({ body, documentsService }) => {
      return await documentsService.createDocument(body);
    },
    {
      body: createDocumentRequest,
      response: createDocumentResponse,
    },
  );
};
