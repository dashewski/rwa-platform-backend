import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { updateQuestionTextRequest, updateQuestionTextResponse } from '../../models/validation/questions.validation';

// Private endpoint
export const updateQuestionTextController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'UpdateQuestionTextController' }).use(servicesPlugin).post(
    '/updateQuestionText',
    async ({ body, questionsService }) => {
      return await questionsService.updateQuestionText(body);
    },
    {
      body: updateQuestionTextRequest,
      response: updateQuestionTextResponse,
    },
  );
};
