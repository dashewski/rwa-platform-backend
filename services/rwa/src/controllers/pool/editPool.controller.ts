import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { editPoolRequest, editPoolResponse } from '../../models/validation/pool.validation';

// Private endpoint
export const editPoolController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'EditPoolController' }).use(servicesPlugin).post(
    '/editPool',
    async ({ body, poolService }) => {
      return await poolService.editPool(body);
    },
    {
      body: editPoolRequest,
      response: editPoolResponse,
    },
  );
};
