import { Elysia } from 'elysia';
import { deleteFileRequest, deleteFileResponse } from '../models/validation/file.validation';
import type { ServicesPlugin } from '../plugins/services.plugin';

// Private endpoint
export const deleteFileController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'DeleteFileController' }).use(servicesPlugin).post(
    '/deleteFile',
    async ({ body, fileService }) => {
      const { id } = body as {
        id: string;
      };

      const result = await fileService.deleteFile(id);

      return result;
    },
    {
      body: deleteFileRequest,
      response: deleteFileResponse,
    },
  );
};
