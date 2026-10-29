import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { createCompanyRequest, createCompanyResponse } from '../../models/validation/company.validation';

// Private endpoint
export const createCompanyController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'CreateCompanyController' }).use(servicesPlugin).post(
    '/createCompany',
    async ({ body, companyService }) => {
      return await companyService.createCompany(body);
    },
    {
      body: createCompanyRequest,
      response: createCompanyResponse,
    },
  );
};
