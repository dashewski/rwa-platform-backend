import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../plugins/services.plugin';
import { getFeesRequest, getFeesResponse } from '../models/validation/loyalty.validation';

// Private endpoint
export const getFeesController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetFeesController' }).use(servicesPlugin).post(
    '/getFees',
    async ({ body, loyaltyService }) => {
      return await loyaltyService.getFees(body);
    },
    {
      body: getFeesRequest,
      response: getFeesResponse,
    },
  );
};
