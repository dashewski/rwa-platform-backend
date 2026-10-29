import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { getQuestionRequest, getQuestionResponse } from '../../models/validation/questions.validation';

// Private endpoint
export const getQuestionController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetQuestionController' }).use(servicesPlugin).post(
    '/getQuestion',
    async ({ body, questionsService }) => {
      return await questionsService.getQuestion(body.id);
    },
    {
      body: getQuestionRequest,
      response: getQuestionResponse,
    },
  );
};
