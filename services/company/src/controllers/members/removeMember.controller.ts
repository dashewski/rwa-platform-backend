import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { removeMemberRequest, removeMemberResponse } from '../../models/validation/company.validation';

// Private endpoint
export const removeMemberController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'RemoveMemberController' }).use(servicesPlugin).post(
    '/removeMember',
    async ({ body, companyService }) => {
      return await companyService.removeMember(body.id);
    },
    {
      body: removeMemberRequest,
      response: removeMemberResponse,
    },
  );
};
