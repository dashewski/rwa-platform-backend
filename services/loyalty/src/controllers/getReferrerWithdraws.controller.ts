import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../plugins/services.plugin';
import { getReferrerWithdrawsRequest, getReferrerWithdrawsResponse } from '../models/validation/loyalty.validation';

// Private endpoint
export const getReferrerWithdrawsController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetReferrerWithdrawsController' }).use(servicesPlugin).post(
    '/getReferrerWithdraws',
    async ({ body, loyaltyService }) => {
      return await loyaltyService.getReferrerWithdraws(body);
    },
    {
      body: getReferrerWithdrawsRequest,
      response: getReferrerWithdrawsResponse,
    },
  );
};
