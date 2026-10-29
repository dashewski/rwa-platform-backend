import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../plugins/services.plugin';
import { resetReactionRequest, resetReactionResponse } from '../models/validation/reactions.validation';

// Private endpoint
export const resetReactionController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'ResetReactionController' }).use(servicesPlugin).post(
    '/resetReaction',
    async ({ body, reactionsService }) => {
      return reactionsService.resetReaction(body);
    },
    {
      body: resetReactionRequest,
      response: resetReactionResponse,
    },
  );
};
