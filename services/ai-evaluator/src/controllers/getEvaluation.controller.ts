import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../plugins/services.plugin';
import { getEvaluationRequest, getEvaluationResponse } from '../models/validation/evaluation.validation';

// Private endpoint
export const getEvaluationController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetEvaluationController' }).use(servicesPlugin).post(
    '/getEvaluation',
    async ({ body, evaluationService }) => {
      return await evaluationService.getEvaluation(body);
    },
    {
      body: getEvaluationRequest,
      response: getEvaluationResponse,
    },
  );
};
