import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../plugins/services.plugin';
import { evaluateRequest, evaluateResponse } from '../models/validation/evaluation.validation';

// Private endpoint
export const jobEvaluationController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'JobEvaluationController' }).use(servicesPlugin).post(
    '/evaluate',
    async ({ body, evaluationService }) => {
      return await evaluationService.request(body);
    },
    { body: evaluateRequest, response: evaluateResponse },
  );
};
