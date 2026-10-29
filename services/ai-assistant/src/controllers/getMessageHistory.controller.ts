import { Elysia } from 'elysia';
import { getMessageHistoryRequest, getMessageHistoryResponse } from '../models/validation/message.validation';
import type { ServicesPlugin } from '../plugins/services.plugin';

// Private endpoint
export const getMessageHistoryController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetMessageHistoryController' }).use(servicesPlugin).post(
    '/getMessageHistory',
    async ({ body, messageService }) => {
      const messages = await messageService.getMessageHistory(
        body.assistantId,
        body.pagination?.limit,
        body.pagination?.offset,
      );

      return messages;
    },
    {
      body: getMessageHistoryRequest,
      response: getMessageHistoryResponse,
    },
  );
};
