import { Elysia } from 'elysia';
import { deleteMessageRequest, deleteMessageResponse } from '../models/validation/message.validation';
import type { ServicesPlugin } from '../plugins/services.plugin';

// Private endpoint
export const deleteMessageController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'DeleteMessageController' }).use(servicesPlugin).post(
    '/deleteMessage',
    async ({ body, messageService }) => {
      const id = await messageService.deleteMessage(body.id);
      return { id };
    },
    {
      body: deleteMessageRequest,
      response: deleteMessageResponse,
    },
  );
};
