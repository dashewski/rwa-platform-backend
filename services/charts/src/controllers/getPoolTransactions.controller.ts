import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../plugins/services.plugin';
import {
  getPoolTransactionsRequest,
  getPoolTransactionsResponse,
} from '../models/validation/poolTransaction.validation';

// Private endpoint
export const getPoolTransactionsController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetPoolTransactionsController' }).use(servicesPlugin).post(
    '/getPoolTransactions',
    async ({ body, transactionsService }) => {
      return await transactionsService.getTransactions(body);
    },
    {
      body: getPoolTransactionsRequest,
      response: getPoolTransactionsResponse,
    },
  );
};
