import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../plugins/services.plugin';
import { createPoolEvaluationRequest, createEvaluationResponse } from '../models/validation/evaluation.validation';

export const createPoolEvaluationController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'CreatePoolEvaluationController' })
    .use(servicesPlugin)
    .post(
      '/createPoolEvaluation',
      async ({ body, riskEvaluationService }) => await riskEvaluationService.createPoolEvaluation(body),
      {
        body: createPoolEvaluationRequest,
        response: createEvaluationResponse,
      },
    );
};
