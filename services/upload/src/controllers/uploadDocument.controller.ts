import { Elysia } from 'elysia';
import { AppError } from '@shared/errors/app-errors';
import { ErrorHandlerPlugin } from '@shared/errors/error-handler.plugin';
import { uploadDocumentRequest, uploadDocumentResponse } from '../models/validation/upload.validation';
import type { ServicesPlugin } from '../plugins/services.plugin';

// Public endpoint
export const uploadDocumentController = (servicesPlugin: ServicesPlugin) => new Elysia({ name: 'UploadDocumentController' }).use(servicesPlugin)
  .onError(ErrorHandlerPlugin)
  .post(
    '/createDocument',
    async ({ request, body, sessionsJwt, uploadService }) => {
      const token = sessionsJwt.parseToken(request.headers.get('Authorization'));
      const user = sessionsJwt.resolveUser(token);

      if (!user) {
        throw new AppError({ message: 'Authentication required', statusCode: 401, code: 'UNAUTHORIZED' });
      }

      return await uploadService.uploadDocument(user.userId, body);
    },
    {
      body: uploadDocumentRequest,
      response: uploadDocumentResponse,
    },
  );
