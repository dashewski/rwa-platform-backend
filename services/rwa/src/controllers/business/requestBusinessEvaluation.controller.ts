import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import {
  requestBusinessEvaluationRequest,
  requestBusinessEvaluationResponse,
} from '../../models/validation/business.validation';

// Private endpoint
export const requestBusinessEvaluationController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'RequestBusinessEvaluationController' }).use(servicesPlugin).post(
    '/requestBusinessEvaluation',
    async ({ body, businessService }) => {
      return await businessService.requestEvaluation(body);
    },
    {
      body: requestBusinessEvaluationRequest,
      response: requestBusinessEvaluationResponse,
    },
  );
};
