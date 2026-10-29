import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../plugins/services.plugin';
import { getOhlcPriceDataRequest, getOhlcPriceDataResponse } from '../models/validation/charts.validation';

// Private endpoint
export const getOhlcPriceDataController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetOhlcPriceDataController' }).use(servicesPlugin).post(
    '/getOhlcPriceData',
    async ({ body, chartsService }) => {
      return await chartsService.getOhlcPriceData(body);
    },
    {
      body: getOhlcPriceDataRequest,
      response: getOhlcPriceDataResponse,
    },
  );
};
