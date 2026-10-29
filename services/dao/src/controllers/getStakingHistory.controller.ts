import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../plugins/services.plugin';
import { getStakingHistoryRequest, getStakingHistoryResponse } from '../models/validation/dao.validation';

// Private endpoint
export const getStakingHistoryController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetStakingHistoryController' }).use(servicesPlugin).post(
    '/getStakingHistory',
    async ({ body, daoService }) => {
      return await daoService.getStakingHistory(body);
    },
    {
      body: getStakingHistoryRequest,
      response: getStakingHistoryResponse,
    },
  );
};
