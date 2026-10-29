import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../plugins/services.plugin';
import { getVolumeDataRequest, getVolumeDataResponse } from '../models/validation/poolTransaction.validation';

// Private endpoint
export const getVolumeDataController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetVolumeDataController' }).use(servicesPlugin).post(
    '/getVolumeData',
    async ({ body, transactionsService }) => {
      return await transactionsService.getVolumeData(body);
    },
    {
      body: getVolumeDataRequest,
      response: getVolumeDataResponse,
    },
  );
};
