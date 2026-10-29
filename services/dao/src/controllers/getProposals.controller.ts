import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../plugins/services.plugin';
import { getProposalsRequest, getProposalsResponse } from '../models/validation/dao.validation';

// Private endpoint
export const getProposalsController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetProposalsController' }).use(servicesPlugin).post(
    '/getProposals',
    async ({ body, daoService }) => {
      return await daoService.getProposals(body);
    },
    {
      body: getProposalsRequest,
      response: getProposalsResponse,
    },
  );
};
