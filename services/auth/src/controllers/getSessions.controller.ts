import { Elysia } from 'elysia';
import { AppError } from '@shared/errors/app-errors';
import { getSessionsResponse } from '../models/validation/user.validation';
import type { ServicesPlugin } from '../plugins/services.plugin';

// Private endpoint
export const createGetSessionsController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetSessionsController' }).use(servicesPlugin).get(
    '/sessions',
    async ({ request, sessionsJwt, authService }) => {
      const token = sessionsJwt.parseToken(request.headers.get('Authorization'));
      const user = sessionsJwt.resolveUser(token);

      if (!user) {
        throw new AppError({ message: 'Authentication required', statusCode: 401, code: 'UNAUTHORIZED' });
      }

      return await authService.getSessions(user.userId);
    },
    {
      response: getSessionsResponse,
    },
  );
};
