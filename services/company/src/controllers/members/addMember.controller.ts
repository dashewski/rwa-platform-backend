import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { addMemberRequest, addMemberResponse } from '../../models/validation/company.validation';

// Private endpoint
export const addMemberController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'AddMemberController' }).use(servicesPlugin).post(
    '/addMember',
    async ({ body, companyService }) => {
      return await companyService.addMember(body);
    },
    {
      body: addMemberRequest,
      response: addMemberResponse,
    },
  );
};
