import { Elysia } from 'elysia';
import { authenticateRequest, sessionResponse } from '../models/validation/user.validation';
import { ErrorHandlerPlugin } from '@shared/errors/error-handler.plugin';
import type { ServicesPlugin } from '../plugins/services.plugin';

// Public endpoint
export const createAuthenticateController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'AuthenticateController' })
    .use(servicesPlugin)
    .onError(ErrorHandlerPlugin)
    .post('/authenticate', async ({ body, set, authService }) => await authService.authenticate(body, set.headers), {
      body: authenticateRequest,
      response: sessionResponse,
    });
};
