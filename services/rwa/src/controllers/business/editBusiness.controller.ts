import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { editBusinessRequest, editBusinessResponse } from '../../models/validation/business.validation';

// Private endpoint
export const editBusinessController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'EditBusinessController' }).use(servicesPlugin).post(
    '/editBusiness',
    async ({ body, businessService }) => {
      return await businessService.editBusiness(body);
    },
    {
      body: editBusinessRequest,
      response: editBusinessResponse,
    },
  );
};
