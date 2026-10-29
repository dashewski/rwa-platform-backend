import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { getBusinessRequest, getBusinessResponse } from '../../models/validation/business.validation';

// Private endpoint
export const getBusinessController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetBusinessController' }).use(servicesPlugin).post(
    '/getBusiness',
    async ({ body, businessService }) => {
      return await businessService.getBusiness(body.id);
    },
    {
      body: getBusinessRequest,
      response: getBusinessResponse,
    },
  );
};
