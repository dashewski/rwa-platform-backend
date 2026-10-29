import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { createPoolRequest, createPoolResponse } from '../../models/validation/pool.validation';

// Private endpoint
export const createPoolController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'CreatePoolController' }).use(servicesPlugin).post(
    '/createPool',
    async ({ body, poolService }) => {
      return await poolService.createPool(body);
    },
    {
      body: createPoolRequest,
      response: createPoolResponse,
    },
  );
};
