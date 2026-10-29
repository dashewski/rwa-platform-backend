import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { getPoolRequest, getPoolResponse } from '../../models/validation/pool.validation';

// Private endpoint
export const getPoolController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetPoolController' }).use(servicesPlugin).post(
    '/getPool',
    async ({ body, poolService }) => {
      return await poolService.getPool(body.id);
    },
    {
      body: getPoolRequest,
      response: getPoolResponse,
    },
  );
};
