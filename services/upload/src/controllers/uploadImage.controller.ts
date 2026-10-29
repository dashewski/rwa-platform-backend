import { Elysia } from 'elysia';
import { AppError } from '@shared/errors/app-errors';
import { ErrorHandlerPlugin } from '@shared/errors/error-handler.plugin';
import { uploadImageRequest, uploadImageResponse } from '../models/validation/upload.validation';
import type { ServicesPlugin } from '../plugins/services.plugin';

// Public endpoint
export const uploadImageController = (servicesPlugin: ServicesPlugin) => new Elysia({ name: 'UploadImageController' }).use(servicesPlugin)
  .onError(ErrorHandlerPlugin)
  .post(
    '/createImage',
    async ({ request, body, sessionsJwt, uploadService }) => {
      const token = sessionsJwt.parseToken(request.headers.get('Authorization'));
      const user = sessionsJwt.resolveUser(token);

      if (!user) {
        throw new AppError({ message: 'Authentication required', statusCode: 401, code: 'UNAUTHORIZED' });
      }

      return await uploadService.uploadImage(user.userId, body);
    },
    {
      body: uploadImageRequest,
      response: uploadImageResponse,
    },
  );
