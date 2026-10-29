import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import {
  updateQuestionAnswerRequest,
  updateQuestionAnswerResponse,
} from '../../models/validation/questions.validation';

// Private endpoint
export const updateQuestionAnswerController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'UpdateQuestionAnswerController' }).use(servicesPlugin).post(
    '/updateQuestionAnswer',
    async ({ body, questionsService }) => {
      return await questionsService.updateAnswer(body);
    },
    {
      body: updateQuestionAnswerRequest,
      response: updateQuestionAnswerResponse,
    },
  );
};
