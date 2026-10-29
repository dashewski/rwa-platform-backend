import { Elysia } from 'elysia';
import { getSignatureTaskRequest, getSignatureTaskResponse } from '../models/validation/signature.validation';
import type { ServicesPlugin } from '../plugins/services.plugin';

// Private endpoint
export const getSignatureTaskController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetSignatureTaskController' }).use(servicesPlugin).post(
    '/getSignatureTask',
    async ({ body, signaturesService }) => {
      const result = await signaturesService.getSignatureTask(body.taskId);

      return result;
    },
    {
      body: getSignatureTaskRequest,
      response: getSignatureTaskResponse,
    },
  );
};
