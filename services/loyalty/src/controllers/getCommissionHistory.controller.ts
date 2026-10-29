import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../plugins/services.plugin';
import { getCommissionHistoryRequest, getCommissionHistoryResponse } from '../models/validation/loyalty.validation';

// Private endpoint
export const getCommissionHistoryController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetCommissionHistoryController' }).use(servicesPlugin).post(
    '/getCommissionHistory',
    async ({ body, loyaltyService }) => {
      return await loyaltyService.getCommissionHistory(body);
    },
    {
      body: getCommissionHistoryRequest,
      response: getCommissionHistoryResponse,
    },
  );
};
