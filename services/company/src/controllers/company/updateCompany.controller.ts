import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { updateCompanyRequest, updateCompanyResponse } from '../../models/validation/company.validation';

// Private endpoint
export const updateCompanyController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'UpdateCompanyController' }).use(servicesPlugin).post(
    '/updateCompany',
    async ({ body, companyService }) => {
      return await companyService.updateCompany(body);
    },
    {
      body: updateCompanyRequest,
      response: updateCompanyResponse,
    },
  );
};
