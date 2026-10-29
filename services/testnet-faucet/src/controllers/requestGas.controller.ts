import { Elysia } from 'elysia';

import type { ServicesPlugin } from '../plugins/services.plugin';
import { requestGasResponse, requestGasSchema } from '../models/validation/faucet.validation';

// Private endpoint
export const requestGasController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'RequestGasController' }).use(servicesPlugin).post(
    '/requestGas',
    async ({ body, faucetService }) => {
      const request = await faucetService.requestGasToken({
        userId: body.userId,
        wallet: body.wallet,
        amount: body.amount,
      });

      return request;
    },
    {
      body: requestGasSchema,
      response: requestGasResponse,
    },
  );
};
