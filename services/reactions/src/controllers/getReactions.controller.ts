import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../plugins/services.plugin';
import { getReactionsRequest, getReactionsResponse } from '../models/validation/reactions.validation';

// Private endpoint
export const getReactionsController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetReactionsController' }).use(servicesPlugin).post(
    '/getReactions',
    async ({ body, reactionsService }) => {
      return reactionsService.getReactions(body);
    },
    {
      body: getReactionsRequest,
      response: getReactionsResponse,
    },
  );
};
