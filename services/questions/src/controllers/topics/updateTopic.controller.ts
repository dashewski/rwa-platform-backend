import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { updateTopicRequest, updateTopicResponse } from '../../models/validation/questions.validation';

// Private endpoint
export const updateTopicController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'UpdateTopicController' }).use(servicesPlugin).post(
    '/updateTopic',
    async ({ body, questionsService }) => {
      return await questionsService.updateTopic(body);
    },
    {
      body: updateTopicRequest,
      response: updateTopicResponse,
    },
  );
};
