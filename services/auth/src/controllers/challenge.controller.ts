import { Elysia } from 'elysia';
import { ErrorHandlerPlugin } from '@shared/errors/error-handler.plugin';
import { challengeRequest, challengeResponse } from '../models/validation/user.validation';
import type { ServicesPlugin } from '../plugins/services.plugin';

// Public endpoint
export const createChallengeController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'ChallengeController' })
    .use(servicesPlugin)
    .onError(ErrorHandlerPlugin)
    .post('/challenge', async ({ body, authService }) => await authService.createChallenge(body.wallet), {
      body: challengeRequest,
      response: challengeResponse,
    });
};
