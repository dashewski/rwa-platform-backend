import { Elysia } from 'elysia';
import { createAssistantRequest, createAssistantResponse } from '../models/validation/assistant.validation';
import type { ServicesPlugin } from '../plugins/services.plugin';

// Private endpoint
export const createAssistantController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'CreateAssistantController' }).use(servicesPlugin).post(
    '/createAssistant',
    async ({ body, assistantService }) => {
      const assistant = await assistantService.createAssistant({
        name: body.name,
        userId: body.userId,
        contextPreferences: body.contextPreferences,
      });

      return assistant;
    },
    {
      body: createAssistantRequest,
      response: createAssistantResponse,
    },
  );
};
