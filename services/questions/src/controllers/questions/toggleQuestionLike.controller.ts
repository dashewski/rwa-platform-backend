import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { toggleQuestionLikeRequest, toggleQuestionLikeResponse } from '../../models/validation/questions.validation';

// Private endpoint
export const toggleQuestionLikeController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'ToggleQuestionLikeController' }).use(servicesPlugin).post(
    '/toggleQuestionLike',
    async ({ body, questionsService }) => {
      return await questionsService.toggleLike(body);
    },
    {
      body: toggleQuestionLikeRequest,
      response: toggleQuestionLikeResponse,
    },
  );
};
