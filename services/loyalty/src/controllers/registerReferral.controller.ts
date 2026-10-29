import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../plugins/services.plugin';
import { registerReferralRequest, registerReferralResponse } from '../models/validation/loyalty.validation';

// Private endpoint
export const registerReferralController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'RegisterReferralController' }).use(servicesPlugin).post(
    '/registerReferral',
    async ({ body, loyaltyService }) => {
      const referral = await loyaltyService.registerReferral(body);

      return referral;
    },
    {
      body: registerReferralRequest,
      response: registerReferralResponse,
    },
  );
};
