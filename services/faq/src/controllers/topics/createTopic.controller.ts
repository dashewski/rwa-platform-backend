import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { createTopicRequest, createTopicResponse } from '../../models/validation/faq.validation';

// Private endpoint
export const createTopicController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'CreateTopicController' }).use(servicesPlugin).post(
    '/createTopic',
    async ({ body, faqService }) => {
      return await faqService.createTopic(body);
    },
    {
      body: createTopicRequest,
      response: createTopicResponse,
    },
  );
};
