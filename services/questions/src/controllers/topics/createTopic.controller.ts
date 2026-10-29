import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { createTopicRequest, createTopicResponse } from '../../models/validation/questions.validation';

// Private endpoint
export const createTopicController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'CreateTopicController' }).use(servicesPlugin).post(
    '/createTopic',
    async ({ body, questionsService }) => {
      return await questionsService.createTopic(body);
    },
    {
      body: createTopicRequest,
      response: createTopicResponse,
    },
  );
};
