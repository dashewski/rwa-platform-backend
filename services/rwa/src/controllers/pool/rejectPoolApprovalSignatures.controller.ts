import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import {
  rejectPoolApprovalSignaturesRequest,
  rejectPoolApprovalSignaturesResponse,
} from '../../models/validation/pool.validation';

// Private endpoint
export const rejectPoolApprovalSignaturesController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'RejectPoolApprovalSignaturesController' }).use(servicesPlugin).post(
    '/rejectPoolApprovalSignatures',
    async ({ body, poolService }) => {
      return await poolService.rejectApprovalSignatures(body.id);
    },
    {
      body: rejectPoolApprovalSignaturesRequest,
      response: rejectPoolApprovalSignaturesResponse,
    },
  );
};
