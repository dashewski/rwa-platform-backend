import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { createBusinessWithAIRequest, createBusinessWithAIResponse } from '../../models/validation/business.validation';

// Private endpoint
export const createBusinessWithAIController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'CreateBusinessWithAIController' }).use(servicesPlugin).post(
    '/createBusinessWithAI',
    async ({ body, businessService }) => {
      return await businessService.createBusinessWithAI(body);
    },
    {
      body: createBusinessWithAIRequest,
      response: createBusinessWithAIResponse,
    },
  );
};
