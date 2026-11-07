import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../plugins/services.plugin';
import { jobEvaluationRequest, jobEvaluationResponse } from '../models/validation/evaluation.validation';

// Private endpoint
export const jobEvaluationController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'JobEvaluationController' }).use(servicesPlugin).post(
    '/jobEvaluation',
    async ({ body, evaluationService }) => {
      return await evaluationService.request(body);
    },
    { body: jobEvaluationRequest, response: jobEvaluationResponse },
  );
};
