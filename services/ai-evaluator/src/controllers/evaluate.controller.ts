import { Elysia } from 'elysia';
import { evaluateBody, evaluateResponse } from '../models/validation/evaluate.validation';
import type { ServicesPlugin } from '../plugins/services.plugin';

// Private endpoint
export const evaluateController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'EvaluateController' }).use(servicesPlugin).post(
    '/evaluate',
    async ({ body, evaluationJobService }) => {
      const evaluationId = await evaluationJobService.start(body);

      return { evaluationId };
    },
    {
      body: evaluateBody,
      response: evaluateResponse,
    },
  );
};
