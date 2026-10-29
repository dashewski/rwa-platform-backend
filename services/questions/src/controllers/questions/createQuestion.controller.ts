import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { createQuestionRequest, createQuestionResponse } from '../../models/validation/questions.validation';

// Private endpoint
export const createQuestionController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'CreateQuestionController' }).use(servicesPlugin).post(
    '/createQuestion',
    async ({ body, questionsService }) => {
      return await questionsService.createQuestion(body);
    },
    {
      body: createQuestionRequest,
      response: createQuestionResponse,
    },
  );
};
