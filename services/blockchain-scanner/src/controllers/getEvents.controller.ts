import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../plugins/services.plugin';
import { getEventsRequest, getEventsResponse } from '../models/validation/event.validation';

// Private endpoint
export const getEventsController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetEventsController' }).use(servicesPlugin).post(
    '/getEvents',
    async ({ body, blockchainScannerService }) => {
      const { pagination, ...filters } = body;

      return await blockchainScannerService.getEvents(filters, pagination);
    },
    {
      body: getEventsRequest,
      response: getEventsResponse,
    },
  );
};
