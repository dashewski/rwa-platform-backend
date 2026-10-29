import { Elysia } from 'elysia';
import { getAssistantRequest, getAssistantResponse } from '../models/validation/assistant.validation';
import type { ServicesPlugin } from '../plugins/services.plugin';

// Private endpoint
export const getAssistantController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetAssistantController' }).use(servicesPlugin).post(
    '/getAssistant',
    async ({ body, assistantService }) => {
      const assistant = await assistantService.getAssistant(body.id);
      return assistant;
    },
    {
      body: getAssistantRequest,
      response: getAssistantResponse,
    },
  );
};
