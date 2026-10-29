import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import {
  rejectBusinessApprovalSignaturesRequest,
  rejectBusinessApprovalSignaturesResponse,
} from '../../models/validation/business.validation';

// Private endpoint
export const rejectBusinessApprovalSignaturesController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'RejectBusinessApprovalSignaturesController' }).use(servicesPlugin).post(
    '/rejectBusinessApprovalSignatures',
    async ({ body, businessService }) => {
      return await businessService.rejectApprovalSignatures(body.id);
    },
    {
      body: rejectBusinessApprovalSignaturesRequest,
      response: rejectBusinessApprovalSignaturesResponse,
    },
  );
};
