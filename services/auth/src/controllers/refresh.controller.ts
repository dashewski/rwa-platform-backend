import { Elysia } from 'elysia';
import { ErrorHandlerPlugin } from '@shared/errors/error-handler.plugin';
import { sessionResponse } from '../models/validation/user.validation';
import type { ServicesPlugin } from '../plugins/services.plugin';

// Public endpoint
export const createRefreshController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'RefreshController' })
    .use(servicesPlugin)
    .onError(ErrorHandlerPlugin)
    .post(
      '/refresh',
      async ({ request, set, authService }) => await authService.refresh(set.headers, request.headers.get('cookie')),
      {
        response: sessionResponse,
      },
    );
};
