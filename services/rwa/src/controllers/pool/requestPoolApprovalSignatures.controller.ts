import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import {
  requestPoolApprovalSignaturesRequest,
  requestPoolApprovalSignaturesResponse,
} from '../../models/validation/pool.validation';

// Private endpoint
export const requestPoolApprovalSignaturesController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'RequestPoolApprovalSignaturesController' }).use(servicesPlugin).post(
    '/requestPoolApprovalSignatures',
    async ({ body, poolService }) => {
      return await poolService.requestApprovalSignatures(body);
    },
    {
      body: requestPoolApprovalSignaturesRequest,
      response: requestPoolApprovalSignaturesResponse,
    },
  );
};
