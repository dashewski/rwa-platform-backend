import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../plugins/services.plugin';
import { getVotesRequest, getVotesResponse } from '../models/validation/dao.validation';

// Private endpoint
export const getVotesController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetVotesController' }).use(servicesPlugin).post(
    '/getVotes',
    async ({ body, daoService }) => {
      return await daoService.getVotes(body);
    },
    {
      body: getVotesRequest,
      response: getVotesResponse,
    },
  );
};
