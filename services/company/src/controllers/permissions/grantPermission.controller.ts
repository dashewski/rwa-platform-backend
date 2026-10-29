import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { grantPermissionRequest, grantPermissionResponse } from '../../models/validation/company.validation';

// Private endpoint
export const grantPermissionController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GrantPermissionController' }).use(servicesPlugin).post(
    '/grantPermission',
    async ({ body, companyService }) => {
      return await companyService.grantPermission(body);
    },
    {
      body: grantPermissionRequest,
      response: grantPermissionResponse,
    },
  );
};
