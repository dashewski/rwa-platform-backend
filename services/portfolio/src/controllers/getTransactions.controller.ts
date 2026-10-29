import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../plugins/services.plugin';
import { getTransactionsRequest, getTransactionsResponse } from '../models/validation/portfolio.validation';

// Private endpoint
export const getTransactionsController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetTransactionsController' }).use(servicesPlugin).post(
    '/getTransactions',
    async ({ body, portfolioService }) => {
      return await portfolioService.getTransactions(body);
    },
    {
      body: getTransactionsRequest,
      response: getTransactionsResponse,
    },
  );
};
