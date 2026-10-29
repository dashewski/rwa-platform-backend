import { Elysia } from 'elysia';
import { updateFileRequest, updateFileResponse } from '../models/validation/file.validation';
import type { ServicesPlugin } from '../plugins/services.plugin';

// Private endpoint
export const updateFileController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'UpdateFileController' }).use(servicesPlugin).post(
    '/updateFile',
    async ({ body, fileService }) => {
      const { id, name } = body;

      const file = await fileService.updateFile(id, {
        name,
      });

      return file;
    },
    {
      body: updateFileRequest,
      response: updateFileResponse,
    },
  );
};
