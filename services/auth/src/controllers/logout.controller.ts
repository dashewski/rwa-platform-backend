import { Elysia } from 'elysia';
import { ErrorHandlerPlugin } from '@shared/errors/error-handler.plugin';
import { logoutCookieResponse } from '../models/validation/user.validation';
import type { ServicesPlugin } from '../plugins/services.plugin';

// Public endpoint
export const createLogoutController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'LogoutController' })
    .use(servicesPlugin)
    .onError(ErrorHandlerPlugin)
    .post(
      '/logout',
      async ({ request, set, authService }) => await authService.logout(set.headers, request.headers.get('cookie')),
      {
        response: logoutCookieResponse,
      },
    );
};
