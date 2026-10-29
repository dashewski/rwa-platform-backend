import { Elysia } from 'elysia';
import { updateAssistantRequest, updateAssistantResponse } from '../models/validation/assistant.validation';
import type { ServicesPlugin } from '../plugins/services.plugin';

// Private endpoint
export const updateAssistantController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'UpdateAssistantController' }).use(servicesPlugin).post(
    '/updateAssistant',
    async ({ body, assistantService }) => {
      const assistant = await assistantService.updateAssistant(body.id, {
        name: body.name,
        contextPreferences: body.contextPreferences,
      });

      return assistant;
    },
    {
      body: updateAssistantRequest,
      response: updateAssistantResponse,
    },
  );
};
