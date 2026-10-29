import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../plugins/services.plugin';
import { getRawPriceDataRequest, getRawPriceDataResponse } from '../models/validation/charts.validation';

// Private endpoint
export const getRawPriceDataController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetRawPriceDataController' }).use(servicesPlugin).post(
    '/getRawPriceData',
    async ({ body, chartsService }) => {
      return await chartsService.getRawPriceData(body);
    },
    {
      body: getRawPriceDataRequest,
      response: getRawPriceDataResponse,
    },
  );
};
