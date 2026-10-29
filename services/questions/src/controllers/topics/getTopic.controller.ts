import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { getTopicRequest, getTopicResponse } from '../../models/validation/questions.validation';

// Private endpoint
export const getTopicController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetTopicController' }).use(servicesPlugin).post(
    '/getTopic',
    async ({ body, questionsService }) => {
      return await questionsService.getTopic(body.id);
    },
    {
      body: getTopicRequest,
      response: getTopicResponse,
    },
  );
};
