import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../plugins/services.plugin';
import { setReactionRequest, setReactionResponse } from '../models/validation/reactions.validation';

// Private endpoint
export const setReactionController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'SetReactionController' }).use(servicesPlugin).post(
    '/setReaction',
    async ({ body, reactionsService }) => {
      return reactionsService.setReaction(body);
    },
    {
      body: setReactionRequest,
      response: setReactionResponse,
    },
  );
};
