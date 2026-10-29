import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { getBusinessesRequest, getBusinessesResponse } from '../../models/validation/business.validation';

// Private endpoint
export const getBusinessesController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetBusinessesController' }).use(servicesPlugin).post(
    '/getBusinesses',
    async ({ body, businessService }) => {
      return await businessService.getBusinesses(body);
    },
    {
      body: getBusinessesRequest,
      response: getBusinessesResponse,
    },
  );
};
