import { Elysia } from 'elysia';

import type { ServicesPlugin } from '../plugins/services.plugin';
import { requestHoldResponse, requestHoldSchema } from '../models/validation/faucet.validation';

// Private endpoint
export const requestHoldController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'RequestHoldController' }).use(servicesPlugin).post(
    '/requestHold',
    async ({ body, faucetService }) => {
      const request = await faucetService.requestHoldToken({
        userId: body.userId,
        wallet: body.wallet,
        amount: body.amount,
      });

      return request;
    },
    {
      body: requestHoldSchema,
      response: requestHoldResponse,
    },
  );
};
