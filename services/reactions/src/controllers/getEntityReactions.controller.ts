import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../plugins/services.plugin';
import { getEntityReactionsRequest, getEntityReactionsResponse } from '../models/validation/reactions.validation';

// Private endpoint
export const getEntityReactionsController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetEntityReactionsController' }).use(servicesPlugin).post(
    '/getEntityReactions',
    async ({ body, reactionsService }) => {
      return reactionsService.getEntityReactions(body);
    },
    {
      body: getEntityReactionsRequest,
      response: getEntityReactionsResponse,
    },
  );
};
