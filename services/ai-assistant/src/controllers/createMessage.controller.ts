import { Elysia } from 'elysia';
import { createMessageRequest, createMessageResponse } from '../models/validation/message.validation';
import type { ServicesPlugin } from '../plugins/services.plugin';

// Private endpoint
export const createMessageController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'CreateMessageController' }).use(servicesPlugin).post(
    '/createMessage',
    async ({ body, messageService }) => {
      const result = await messageService.createMessage({
        assistantId: body.assistantId,
        text: body.text,
      });

      return result;
    },
    {
      body: createMessageRequest,
      response: createMessageResponse,
    },
  );
};
