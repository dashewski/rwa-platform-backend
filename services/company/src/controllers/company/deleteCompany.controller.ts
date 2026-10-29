import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { deleteCompanyRequest, deleteCompanyResponse } from '../../models/validation/company.validation';

// Private endpoint
export const deleteCompanyController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'DeleteCompanyController' }).use(servicesPlugin).post(
    '/deleteCompany',
    async ({ body, companyService }) => {
      return await companyService.deleteCompany(body.id);
    },
    {
      body: deleteCompanyRequest,
      response: deleteCompanyResponse,
    },
  );
};
