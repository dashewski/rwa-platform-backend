import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { createBusinessRequest, createBusinessResponse } from '../../models/validation/business.validation';

// Private endpoint
export const createBusinessController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'CreateBusinessController' }).use(servicesPlugin).post(
    '/createBusiness',
    async ({ body, businessService }) => {
      return await businessService.createBusiness(body);
    },
    {
      body: createBusinessRequest,
      response: createBusinessResponse,
    },
  );
};
