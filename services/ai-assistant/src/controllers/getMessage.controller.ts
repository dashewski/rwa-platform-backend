import { Elysia } from 'elysia';
import { getMessageRequest, getMessageResponse } from '../models/validation/message.validation';
import type { ServicesPlugin } from '../plugins/services.plugin';

// Private endpoint
export const getMessageController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetMessageController' }).use(servicesPlugin).post(
    '/getMessage',
    async ({ body, messageService }) => {
      const message = await messageService.getMessage(body.id);
      return message;
    },
    {
      body: getMessageRequest,
      response: getMessageResponse,
    },
  );
};
