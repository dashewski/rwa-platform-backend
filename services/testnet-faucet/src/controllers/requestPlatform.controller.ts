import { Elysia } from 'elysia';

import type { ServicesPlugin } from '../plugins/services.plugin';
import { requestPlatformResponse, requestPlatformSchema } from '../models/validation/faucet.validation';

// Private endpoint
export const requestPlatformController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'RequestPlatformController' }).use(servicesPlugin).post(
    '/requestPlatform',
    async ({ body, faucetService }) => {
      const request = await faucetService.requestPlatformToken({
        userId: body.userId,
        wallet: body.wallet,
        amount: body.amount,
      });

      return request;
    },
    {
      body: requestPlatformSchema,
      response: requestPlatformResponse,
    },
  );
};
