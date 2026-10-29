import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import {
  requestBusinessApprovalSignaturesRequest,
  requestBusinessApprovalSignaturesResponse,
} from '../../models/validation/business.validation';

// Private endpoint
export const requestBusinessApprovalSignaturesController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'RequestBusinessApprovalSignaturesController' }).use(servicesPlugin).post(
    '/requestBusinessApprovalSignatures',
    async ({ body, businessService }) => {
      return await businessService.requestApprovalSignatures(body);
    },
    {
      body: requestBusinessApprovalSignaturesRequest,
      response: requestBusinessApprovalSignaturesResponse,
    },
  );
};
