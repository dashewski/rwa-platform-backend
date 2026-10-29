import { Elysia } from 'elysia';
import { createFileRequest, createFileResponse } from '../models/validation/file.validation';
import type { ServicesPlugin } from '../plugins/services.plugin';
import { AppError } from '@shared/errors/app-errors';

// Private endpoint
export const createFileController = (servicesPlugin: ServicesPlugin, maxFileSize: number) => {
  return new Elysia({ name: 'CreateFileController' }).use(servicesPlugin).post(
    '/createFile',
    async ({ body, fileService }) => {
      if (body.file.size > maxFileSize) {
        throw new AppError({
          message: `File size exceeds maximum allowed size of ${maxFileSize} bytes`,
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
      }

      const result = await fileService.createFile(body);

      return result;
    },
    {
      body: createFileRequest,
      response: createFileResponse,
    },
  );
};
