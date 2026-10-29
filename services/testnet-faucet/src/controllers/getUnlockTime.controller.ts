import { Elysia } from 'elysia';

import type { ServicesPlugin } from '../plugins/services.plugin';
import { getUnlockTimeResponse, getUnlockTimeSchema } from '../models/validation/faucet.validation';

// Private endpoint
export const getUnlockTimeController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetUnlockTimeController' }).use(servicesPlugin).post(
    '/getUnlockTime',
    async ({ body, faucetService }) => {
      const unlockTime = await faucetService.getTokenUnlockTime({
        userId: body.userId,
      });

      return unlockTime;
    },
    {
      body: getUnlockTimeSchema,
      response: getUnlockTimeResponse,
    },
  );
};
