import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../plugins/services.plugin';
import { getStakingRequest, getStakingResponse } from '../models/validation/dao.validation';

// Private endpoint
export const getStakingController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetStakingController' }).use(servicesPlugin).post(
    '/getStaking',
    async ({ body, daoService }) => {
      return await daoService.getStaking(body);
    },
    {
      body: getStakingRequest,
      response: getStakingResponse,
    },
  );
};
