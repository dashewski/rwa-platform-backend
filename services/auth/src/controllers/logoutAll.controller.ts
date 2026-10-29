import { Elysia } from 'elysia';
import { ErrorHandlerPlugin } from '@shared/errors/error-handler.plugin';
import { logoutResponse } from '../models/validation/user.validation';
import type { ServicesPlugin } from '../plugins/services.plugin';

// Public endpoint
export const createLogoutAllController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'LogoutAllController' })
    .use(servicesPlugin)
    .onError(ErrorHandlerPlugin)
    .post(
      '/logoutAll',
      async ({ request, set, authService }) => await authService.logoutAll(set.headers, request.headers.get('cookie')),
      {
        response: logoutResponse,
      },
    );
};
