import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { deleteTopicRequest, deleteTopicResponse } from '../../models/validation/faq.validation';

// Private endpoint
export const deleteTopicController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'DeleteTopicController' }).use(servicesPlugin).post(
    '/deleteTopic',
    async ({ body, faqService }) => {
      return await faqService.deleteTopic(body.id);
    },
    {
      body: deleteTopicRequest,
      response: deleteTopicResponse,
    },
  );
};
