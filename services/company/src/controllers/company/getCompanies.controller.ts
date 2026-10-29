import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { getCompaniesRequest, getCompaniesResponse } from '../../models/validation/company.validation';

// Private endpoint
export const getCompaniesController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetCompaniesController' }).use(servicesPlugin).post(
    '/getCompanies',
    async ({ body, companyService }) => {
      return await companyService.getCompanies(body);
    },
    {
      body: getCompaniesRequest,
      response: getCompaniesResponse,
    },
  );
};
