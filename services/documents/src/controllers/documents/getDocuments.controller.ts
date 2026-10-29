import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { getDocumentsRequest, getDocumentsResponse } from '../../models/validation/documents.validation';

// Private endpoint
export const getDocumentsController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetDocumentsController' }).use(servicesPlugin).post(
    '/getDocuments',
    async ({ body, documentsService }) => {
      return await documentsService.getDocuments(body);
    },
    {
      body: getDocumentsRequest,
      response: getDocumentsResponse,
    },
  );
};
