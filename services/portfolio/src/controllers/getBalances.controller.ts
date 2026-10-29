import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../plugins/services.plugin';
import { getBalancesRequest, getBalancesResponse } from '../models/validation/portfolio.validation';

// Private endpoint
export const getBalancesController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetBalancesController' }).use(servicesPlugin).post(
    '/getBalances',
    async ({ body, portfolioService }) => {
      return await portfolioService.getBalances(body);
    },
    {
      body: getBalancesRequest,
      response: getBalancesResponse,
    },
  );
};
