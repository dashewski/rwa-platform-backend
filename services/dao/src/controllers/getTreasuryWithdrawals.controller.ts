import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../plugins/services.plugin';
import { getTreasuryWithdrawalsRequest, getTreasuryWithdrawalsResponse } from '../models/validation/dao.validation';

// Private endpoint
export const getTreasuryWithdrawalsController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetTreasuryWithdrawalsController' }).use(servicesPlugin).post(
    '/getTreasuryWithdrawals',
    async ({ body, daoService }) => {
      return await daoService.getTreasuryWithdrawals(body);
    },
    {
      body: getTreasuryWithdrawalsRequest,
      response: getTreasuryWithdrawalsResponse,
    },
  );
};
