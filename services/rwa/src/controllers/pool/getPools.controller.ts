import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { getPoolsRequest, getPoolsResponse } from '../../models/validation/pool.validation';

// Private endpoint
export const getPoolsController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetPoolsController' }).use(servicesPlugin).post(
    '/getPools',
    async ({ body, poolService }) => {
      return await poolService.getPools(body);
    },
    {
      body: getPoolsRequest,
      response: getPoolsResponse,
    },
  );
};
