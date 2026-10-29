import { Elysia } from 'elysia';
import type { ServicesPlugin } from '../../plugins/services.plugin';
import { updateAnswerRequest, updateAnswerResponse } from '../../models/validation/faq.validation';

// Private endpoint
export const updateAnswerController = (servicesPlugin: ServicesPlugin) => {
  return new Elysia({ name: 'UpdateAnswerController' }).use(servicesPlugin).post(
    '/updateAnswer',
    async ({ body, faqService }) => {
      return await faqService.updateAnswer(body);
    },
    {
      body: updateAnswerRequest,
      response: updateAnswerResponse,
    },
  );
};
