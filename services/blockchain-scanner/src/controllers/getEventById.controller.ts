import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../plugins/services.plugin';
import { getEventByIdRequest, getEventByIdResponse } from '../models/validation/event.validation';

// Private endpoint
export const getEventByIdController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetEventByIdController' }).use(servicesPlugin).post(
    '/getEventById',
    async ({ body, blockchainScannerService }) => {
      return await blockchainScannerService.getEventById(body.id);
    },
    {
      body: getEventByIdRequest,
      response: getEventByIdResponse,
    },
  );
};
