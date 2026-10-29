import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { updateTopicRequest, updateTopicResponse } from '../../models/validation/faq.validation';

// Private endpoint
export const updateTopicController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'UpdateTopicController' }).use(servicesPlugin).post(
    '/updateTopic',
    async ({ body, faqService }) => {
      return await faqService.updateTopic(body);
    },
    {
      body: updateTopicRequest,
      response: updateTopicResponse,
    },
  );
};
