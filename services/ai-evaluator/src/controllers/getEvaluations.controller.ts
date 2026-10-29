import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../plugins/services.plugin';
import { getEvaluationsRequest, getEvaluationsResponse } from '../models/validation/evaluation.validation';

// Private endpoint
export const getEvaluationsController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetEvaluationsController' }).use(servicesPlugin).post(
    '/getEvaluations',
    async ({ body, riskEvaluationService }) => {
      return await riskEvaluationService.getEvaluations(body);
    },
    {
      body: getEvaluationsRequest,
      response: getEvaluationsResponse,
    },
  );
};
