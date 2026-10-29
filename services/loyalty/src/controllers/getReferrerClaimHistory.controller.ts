import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../plugins/services.plugin';
import {
  getReferrerClaimHistoryRequest,
  getReferrerClaimHistoryResponse,
} from '../models/validation/loyalty.validation';

// Private endpoint
export const getReferrerClaimHistoryController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetReferrerClaimHistoryController' }).use(servicesPlugin).post(
    '/getReferrerClaimHistory',
    async ({ body, loyaltyService }) => {
      return await loyaltyService.getReferrerClaimHistory(body);
    },
    {
      body: getReferrerClaimHistoryRequest,
      response: getReferrerClaimHistoryResponse,
    },
  );
};
