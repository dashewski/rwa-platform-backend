import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { getCompanyRequest, getCompanyResponse } from '../../models/validation/company.validation';

// Private endpoint
export const getCompanyController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetCompanyController' }).use(servicesPlugin).post(
    '/getCompany',
    async ({ body, companyService }) => {
      return await companyService.getCompany(body.id);
    },
    {
      body: getCompanyRequest,
      response: getCompanyResponse,
    },
  );
};
