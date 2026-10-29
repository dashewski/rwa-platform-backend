import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { deleteQuestionRequest, deleteQuestionResponse } from '../../models/validation/questions.validation';

// Private endpoint
export const deleteQuestionController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'DeleteQuestionController' }).use(servicesPlugin).post(
    '/deleteQuestion',
    async ({ body, questionsService }) => {
      return await questionsService.deleteQuestion(body.id);
    },
    {
      body: deleteQuestionRequest,
      response: deleteQuestionResponse,
    },
  );
};
