import { Elysia } from 'elysia';
import { getUserAssistantsRequest, getUserAssistantsResponse } from '../models/validation/assistant.validation';
import type { ServicesPlugin } from '../plugins/services.plugin';

// Private endpoint
export const getUserAssistantsController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetUserAssistantsController' }).use(servicesPlugin).post(
    '/getUserAssistants',
    async ({ body, assistantService }) => {
      const assistants = await assistantService.getUserAssistants(body.userId);
      return assistants;
    },
    {
      body: getUserAssistantsRequest,
      response: getUserAssistantsResponse,
    },
  );
};
