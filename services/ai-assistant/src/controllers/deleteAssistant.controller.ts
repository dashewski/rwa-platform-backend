import { Elysia } from 'elysia';
import { deleteAssistantRequest, deleteAssistantResponse } from '../models/validation/assistant.validation';
import type { ServicesPlugin } from '../plugins/services.plugin';

// Private endpoint
export const deleteAssistantController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'DeleteAssistantController' }).use(servicesPlugin).post(
    '/deleteAssistant',
    async ({ body, assistantService }) => {
      const result = await assistantService.deleteAssistant(body.id);
      return result;
    },
    {
      body: deleteAssistantRequest,
      response: deleteAssistantResponse,
    },
  );
};
