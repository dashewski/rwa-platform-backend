import { Elysia } from 'elysia';

import type { ServicesPlugin } from '../plugins/services.plugin';
import { getHistoryResponse, getHistorySchema } from '../models/validation/faucet.validation';

// Private endpoint
export const getHistoryController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetHistoryController' }).use(servicesPlugin).post(
    '/getHistory',
    async ({ body, faucetService }) => {
      const history = await faucetService.getRequestHistory({
        userId: body.userId,
        limit: body.pagination?.limit,
        offset: body.pagination?.offset,
      });

      return history;
    },
    {
      body: getHistorySchema,
      response: getHistoryResponse,
    },
  );
};
