import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { getQuestionsRequest, getQuestionsResponse } from '../../models/validation/questions.validation';

// Private endpoint
export const getQuestionsController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetQuestionsController' }).use(servicesPlugin).post(
    '/getQuestions',
    async ({ body, questionsService }) => {
      return await questionsService.getQuestions(body);
    },
    {
      body: getQuestionsRequest,
      response: getQuestionsResponse,
    },
  );
};
