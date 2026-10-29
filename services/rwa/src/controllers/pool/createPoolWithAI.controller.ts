import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { createPoolWithAIRequest, createPoolWithAIResponse } from '../../models/validation/pool.validation';

// Private endpoint
export const createPoolWithAIController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'CreatePoolWithAIController' }).use(servicesPlugin).post(
    '/createPoolWithAI',
    async ({ body, poolService }) => {
      return await poolService.createPoolWithAI(body);
    },
    {
      body: createPoolWithAIRequest,
      response: createPoolWithAIResponse,
    },
  );
};
