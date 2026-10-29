import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { deleteAnswerRequest, deleteAnswerResponse } from '../../models/validation/faq.validation';

// Private endpoint
export const deleteAnswerController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'DeleteAnswerController' }).use(servicesPlugin).post(
    '/deleteAnswer',
    async ({ body, faqService }) => {
      return await faqService.deleteAnswer(body.id);
    },
    {
      body: deleteAnswerRequest,
      response: deleteAnswerResponse,
    },
  );
};
