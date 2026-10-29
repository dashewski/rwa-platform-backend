import { Elysia } from 'elysia';
import { createSignatureTaskRequest, createSignatureTaskResponse } from '../models/validation/signature.validation';
import type { ServicesPlugin } from '../plugins/services.plugin';

// Private endpoint
export const createSignatureTaskController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'CreateSignatureTaskController' }).use(servicesPlugin).post(
    '/createSignatureTask',
    async ({ body, signaturesService }) => {
      const task = await signaturesService.createTask(body);

      return task;
    },
    {
      body: createSignatureTaskRequest,
      response: createSignatureTaskResponse,
    },
  );
};
