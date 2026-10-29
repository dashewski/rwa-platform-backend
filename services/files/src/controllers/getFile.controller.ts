import { Elysia } from 'elysia';
import { getFileRequest, getFileResponse } from '../models/validation/file.validation';
import type { ServicesPlugin } from '../plugins/services.plugin';

// Private endpoint
export const getFileController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetFileController' }).use(servicesPlugin).post(
    '/getFiles',
    async ({ body, fileService }) => {
      const { id } = body as { id: string };

      const file = await fileService.getFile(id);

      return file;
    },
    {
      body: getFileRequest,
      response: getFileResponse,
    },
  );
};
