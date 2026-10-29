import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { revokePermissionRequest, revokePermissionResponse } from '../../models/validation/company.validation';

// Private endpoint
export const revokePermissionController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'RevokePermissionController' }).use(servicesPlugin).post(
    '/revokePermission',
    async ({ body, companyService }) => {
      return await companyService.revokePermission(body.id);
    },
    {
      body: revokePermissionRequest,
      response: revokePermissionResponse,
    },
  );
};
