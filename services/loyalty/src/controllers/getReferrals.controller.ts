import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../plugins/services.plugin';
import { getReferralsRequest, getReferralsResponse } from '../models/validation/loyalty.validation';

// Private endpoint
export const getReferralsController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetReferralsController' }).use(servicesPlugin).post(
    '/getReferrals',
    async ({ body, loyaltyService }) => {
      return await loyaltyService.getReferrals(body);
    },
    {
      body: getReferralsRequest,
      response: getReferralsResponse,
    },
  );
};
