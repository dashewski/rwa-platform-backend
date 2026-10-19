import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../plugins/services.plugin';
import { createBusinessEvaluationRequest, createEvaluationResponse } from '../models/validation/evaluation.validation';

export const createBusinessEvaluationController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'CreateBusinessEvaluationController' })
    .use(servicesPlugin)
    .post(
      '/createBusinessEvaluation',
      async ({ body, riskEvaluationService }) => await riskEvaluationService.createBusinessEvaluation(body),
      {
        body: createBusinessEvaluationRequest,
        response: createEvaluationResponse,
      },
    );
};
