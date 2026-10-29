import { Elysia } from 'elysia';
import { AppError } from '@shared/errors/app-errors';
import { ErrorHandlerPlugin } from '@shared/errors/error-handler.plugin';
import { uploadPoolImageRequest, uploadPoolImageResponse } from '../models/validation/upload.validation';
import type { ServicesPlugin } from '../plugins/services.plugin';

// Public endpoint
export const uploadPoolImageController = (servicesPlugin: ServicesPlugin) => new Elysia({ name: 'UploadPoolImageController' }).use(servicesPlugin)
  .onError(ErrorHandlerPlugin)
  .post(
    '/uploadPoolImage',
    async ({ request, body, sessionsJwt, uploadService }) => {
      const token = sessionsJwt.parseToken(request.headers.get('Authorization'));
      const user = sessionsJwt.resolveUser(token);

      if (!user) {
        throw new AppError({ message: 'Authentication required', statusCode: 401, code: 'UNAUTHORIZED' });
      }

      return await uploadService.uploadPoolImage(user.userId, body);
    },
    {
      body: uploadPoolImageRequest,
      response: uploadPoolImageResponse,
    },
  );
