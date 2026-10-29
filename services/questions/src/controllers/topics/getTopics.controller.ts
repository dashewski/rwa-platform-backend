import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { getTopicsRequest, getTopicsResponse } from '../../models/validation/questions.validation';

// Private endpoint
export const getTopicsController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'GetTopicsController' }).use(servicesPlugin).post(
    '/getTopics',
    async ({ body, questionsService }) => {
      return await questionsService.getTopics(body);
    },
    {
      body: getTopicsRequest,
      response: getTopicsResponse,
    },
  );
};
